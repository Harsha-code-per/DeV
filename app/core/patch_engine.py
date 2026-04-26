"""
Patch Generation and Application Engine for DeV

Generates AI-driven code patches and applies them safely in sandboxes.

Responsibilities:
- Use model provider for root cause analysis
- Generate targeted code fixes
- Apply patches safely to files
- Handle multiple file modifications
- Provide structured patch summary
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any, TYPE_CHECKING
from enum import Enum

from app.models.provider_factory import get_provider
from app.config import CURRENT_PROVIDER, CURRENT_MODEL
from app.core.codebase_analyzer import CodebaseAnalyzer, ProjectStructure, RelevantFiles
from app.utils.logger import setup_logger

if TYPE_CHECKING:
    from app.core.root_cause_engine import RootCauseAnalysis


logger = setup_logger(__name__)


class PatchStatus(str, Enum):
    """Status of a patch"""
    PENDING = "pending"
    GENERATED = "generated"
    APPLIED = "applied"
    FAILED = "failed"


@dataclass
class FilePatch:
    """A single file patch (modification)"""
    file_path: str
    operation: str  # "modify", "create", "delete"
    original_content: Optional[str] = None
    new_content: Optional[str] = None
    change_description: str = ""
    status: PatchStatus = PatchStatus.PENDING
    error: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for logging/display"""
        return {
            "file_path": self.file_path,
            "operation": self.operation,
            "change_description": self.change_description,
            "status": self.status.value,
            "error": self.error,
        }


@dataclass
class PatchPlan:
    """Plan for code modifications"""
    root_cause_analysis: str
    patch_strategy: str
    patches: List[FilePatch] = field(default_factory=list)
    expected_verification_steps: List[str] = field(default_factory=list)
    risks: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for logging/display"""
        return {
            "root_cause_analysis": self.root_cause_analysis,
            "patch_strategy": self.patch_strategy,
            "patches": [p.to_dict() for p in self.patches],
            "expected_verification_steps": self.expected_verification_steps,
            "risks": self.risks,
        }


@dataclass
class PatchSummary:
    """Summary of applied patches"""
    files_modified: List[str]
    files_created: List[str]
    files_deleted: List[str]
    root_cause_found: str
    patch_description: str
    total_lines_changed: int = 0
    success: bool = False
    error_message: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for logging/display"""
        return {
            "files_modified": self.files_modified,
            "files_created": self.files_created,
            "files_deleted": self.files_deleted,
            "root_cause_found": self.root_cause_found,
            "patch_description": self.patch_description,
            "total_lines_changed": self.total_lines_changed,
            "success": self.success,
            "error_message": self.error_message,
        }


class PatchEngine:
    """AI-driven code patch generation and application"""
    
    def __init__(self, repo_path: Path, sandbox_path: Path):
        """
        Initialize patch engine.
        
        Args:
            repo_path: Path to original repository
            sandbox_path: Path to sandbox worktree where changes will be applied
        """
        self.repo_path = Path(repo_path)
        self.sandbox_path = Path(sandbox_path)
        self.provider = get_provider(CURRENT_PROVIDER, CURRENT_MODEL)
        logger.info(f"PatchEngine initialized: repo={repo_path}, sandbox={sandbox_path}")
    
    def plan_patches(
        self,
        task: str,
        structure: ProjectStructure,
        relevant_files: RelevantFiles,
        root_cause_analysis: Optional[Any] = None,  # Optional RootCauseAnalysis
    ) -> PatchPlan:
        """
        Generate AI-driven patch plan before making code changes.
        
        This is the critical trust-first step: plan first, then patch.
        
        Args:
            task: Task description
            structure: Project structure analysis
            relevant_files: Discovered relevant files
            root_cause_analysis: Optional RootCauseAnalysis from Root Cause Intelligence System
        
        Returns:
            PatchPlan with root cause analysis and patch strategy
        """
        logger.info("Planning patches (AI-driven root cause analysis)...")
        
        # Build context for AI analysis
        context = self._build_analysis_context(task, structure, relevant_files)
        
        # Use root cause analysis if provided, otherwise generate
        if root_cause_analysis:
            logger.info("Using Root Cause Intelligence diagnosis")
            analysis_result = self._use_root_cause_analysis(
                root_cause_analysis,
                relevant_files,
            )
        else:
            logger.info("Generating analysis via model provider")
            analysis_result = self._generate_analysis_via_model(task, context)
        
        # Parse analysis result into patch plan
        plan = self._parse_analysis_response(analysis_result, relevant_files)
        logger.info(f"Patch plan generated: {json.dumps(plan.to_dict(), indent=2)}")
        
        return plan
    
    def generate_patches(self, plan: PatchPlan) -> List[FilePatch]:
        """
        Generate actual code patches based on plan.
        
        Args:
            plan: Patch plan from plan_patches()
        
        Returns:
            List of generated file patches
        """
        logger.info(f"Generating patches for {len(plan.patches)} files...")
        
        patches = []
        for planned_patch in plan.patches:
            logger.debug(f"Generating patch for: {planned_patch.file_path}")
            
            # Read original file if it exists
            file_in_sandbox = self.sandbox_path / planned_patch.file_path
            original_content = ""
            
            if file_in_sandbox.exists() and planned_patch.operation == "modify":
                try:
                    original_content = file_in_sandbox.read_text()
                except Exception as e:
                    logger.error(f"Error reading {planned_patch.file_path}: {e}")
                    planned_patch.status = PatchStatus.FAILED
                    planned_patch.error = f"Could not read file: {e}"
                    patches.append(planned_patch)
                    continue
            
            planned_patch.original_content = original_content
            
            # Use model provider to generate specific patch
            if planned_patch.operation == "modify":
                patch_content = self._generate_code_patch(planned_patch, original_content)
                planned_patch.new_content = patch_content
            elif planned_patch.operation == "create":
                patch_content = self._generate_new_file(planned_patch)
                planned_patch.new_content = patch_content
            
            planned_patch.status = PatchStatus.GENERATED
            patches.append(planned_patch)
        
        logger.info(f"Generated {len(patches)} patches")
        return patches
    
    def apply_patches(self, patches: List[FilePatch]) -> PatchSummary:
        """
        Apply patches to sandbox files.
        
        IMPORTANT: Only applies to sandbox, never touches main branch.
        
        Args:
            patches: List of patches to apply
        
        Returns:
            PatchSummary with applied changes
        """
        logger.info(f"Applying {len(patches)} patches to sandbox...")
        
        modified = []
        created = []
        deleted = []
        total_lines = 0
        
        for patch in patches:
            file_path = self.sandbox_path / patch.file_path
            
            try:
                if patch.operation == "modify":
                    # Backup original for safety
                    if file_path.exists():
                        backup_path = file_path.with_suffix(file_path.suffix + ".bak")
                        backup_path.write_text(patch.original_content or "")
                    
                    # Apply patch
                    file_path.parent.mkdir(parents=True, exist_ok=True)
                    file_path.write_text(patch.new_content or "")
                    modified.append(patch.file_path)
                    total_lines += len((patch.new_content or "").split('\n'))
                    patch.status = PatchStatus.APPLIED
                    logger.debug(f"Modified: {patch.file_path}")
                
                elif patch.operation == "create":
                    # Create new file
                    file_path.parent.mkdir(parents=True, exist_ok=True)
                    file_path.write_text(patch.new_content or "")
                    created.append(patch.file_path)
                    total_lines += len((patch.new_content or "").split('\n'))
                    patch.status = PatchStatus.APPLIED
                    logger.debug(f"Created: {patch.file_path}")
                
                elif patch.operation == "delete":
                    # Delete file (safely - only if exists)
                    if file_path.exists():
                        file_path.unlink()
                        deleted.append(patch.file_path)
                        patch.status = PatchStatus.APPLIED
                        logger.debug(f"Deleted: {patch.file_path}")
            
            except Exception as e:
                logger.error(f"Error applying patch to {patch.file_path}: {e}")
                patch.status = PatchStatus.FAILED
                patch.error = str(e)
        
        # Determine success
        success = all(p.status == PatchStatus.APPLIED for p in patches)
        
        summary = PatchSummary(
            files_modified=modified,
            files_created=created,
            files_deleted=deleted,
            root_cause_found="",  # Will be filled from plan
            patch_description="",  # Will be filled from plan
            total_lines_changed=total_lines,
            success=success,
            error_message=None if success else "Some patches failed to apply",
        )
        
        logger.info(f"Patches applied: {len(modified)} modified, {len(created)} created, {len(deleted)} deleted")
        return summary
    
    # Private helper methods
    
    def _use_root_cause_analysis(
        self,
        root_cause_analysis: Any,  # RootCauseAnalysis type
        relevant_files: RelevantFiles,
    ) -> str:
        """
        Use Root Cause Analysis to generate patch strategy.
        
        This integrates with the Root Cause Intelligence System
        to provide more accurate diagnosis before patching.
        """
        logger.debug("Building patch strategy from root cause analysis")
        
        # Extract top hypothesis
        top_hypothesis = (
            root_cause_analysis.hypotheses[0]
            if root_cause_analysis.hypotheses
            else None
        )
        
        # Extract top recommendation
        top_recommendation = (
            root_cause_analysis.recommendations[0]
            if root_cause_analysis.recommendations
            else None
        )
        
        # Build strategy based on diagnosis
        strategy = f"""
Based on Root Cause Intelligence analysis (confidence: {root_cause_analysis.confidence_in_diagnosis:.0%}):

DIAGNOSED CATEGORY: {root_cause_analysis.failure_category.value}
SEVERITY: {root_cause_analysis.severity.value}

TOP HYPOTHESIS ({top_hypothesis.confidence:.0%} confidence if available):
{top_hypothesis.hypothesis if top_hypothesis else 'Unable to determine'}

EVIDENCE:
Supporting: {top_hypothesis.supporting_evidence if top_hypothesis else []}
Conflicting: {top_hypothesis.conflicting_evidence if top_hypothesis else []}
Affected Files: {top_hypothesis.affected_files if top_hypothesis else []}

RECOMMENDED FIX (Priority {top_recommendation.priority if top_recommendation else 1}):
{top_recommendation.recommendation if top_recommendation else 'Apply diagnostic recommendations'}
Risk Level: {top_recommendation.risk_level if top_recommendation else 'medium'}

VERIFICATION STEPS:
{chr(10).join(f'- {step}' for step in top_recommendation.verification_steps if top_recommendation)}

FALLBACK STRATEGY:
{top_recommendation.fallback_recommendation if top_recommendation else 'Manual review recommended'}

FILES TO CHECK/MODIFY:
{chr(10).join(f'- {f}' for f in top_recommendation.affected_files if top_recommendation)}
"""
        
        # Create analysis response in expected format
        analysis_response = json.dumps({
            "root_cause": f"{root_cause_analysis.summary}",
            "strategy": strategy,
            "files_to_modify": (
                top_recommendation.affected_files
                if top_recommendation
                else top_hypothesis.affected_files
                if top_hypothesis
                else []
            ),
            "verification_steps": (
                top_recommendation.verification_steps
                if top_recommendation
                else top_hypothesis.verification_approach.split()
                if top_hypothesis
                else []
            ),
            "risks": root_cause_analysis.recommendations[1:3]
            if len(root_cause_analysis.recommendations) > 1
            else [],
        })
        
        logger.debug(f"Analysis response: {analysis_response}")
        return analysis_response
    
    def _generate_analysis_via_model(self, task: str, context: str) -> str:
        """
        Generate analysis using model provider (fallback when no Root Cause Analysis).
        
        This is the original code path for backward compatibility.
        """
        analysis_prompt = f"""
You are an elite senior software engineer analyzing a failing production system.

TASK:
{task}

PROJECT CONTEXT:
{context}

ANALYSIS REQUIRED:
1. Root cause analysis - What's actually wrong?
2. Patch strategy - How to fix it minimally and safely?
3. Files to modify - Which specific files need changes?
4. Expected verification - How to verify the fix works?
5. Risks - What could go wrong?

Be precise, concise, and production-focused.
Output as structured JSON with keys: root_cause, strategy, files_to_modify, verification_steps, risks
"""
        
        logger.debug(f"Sending analysis prompt to {CURRENT_PROVIDER}...")
        analysis_response = self.provider.generate(analysis_prompt)
        return analysis_response
    
    def _build_analysis_context(
        self,
        task: str,
        structure: ProjectStructure,
        relevant_files: RelevantFiles,
    ) -> str:
        """Build context for AI analysis"""
        context = f"""
PROJECT TYPE: {structure.project_type.value}
BUILD SYSTEM: {structure.build_system}
PRIMARY LANGUAGE: {structure.primary_language}

LIKELY AFFECTED FILES:
{json.dumps(relevant_files.likely_affected[:10], indent=2)}

CONFIG FILES:
{json.dumps(relevant_files.config_files, indent=2)}

TEST FILES:
{json.dumps(relevant_files.test_files[:5], indent=2)}

GIT STATUS:
{json.dumps(relevant_files.git_status, indent=2)}

TASK: {task}
"""
        return context
    
    def _parse_analysis_response(self, response: str, relevant_files: RelevantFiles) -> PatchPlan:
        """Parse AI analysis response into patch plan"""
        logger.debug("Parsing analysis response...")
        
        # Try to extract JSON from response
        plan_dict = self._extract_json_from_response(response)
        
        # Create patches for files mentioned in analysis
        patches = []
        if "files_to_modify" in plan_dict:
            for file_path in plan_dict.get("files_to_modify", [])[:5]:  # Limit to 5
                patches.append(FilePatch(
                    file_path=file_path,
                    operation="modify",
                    change_description=f"Apply fix from analysis",
                ))
        
        # Also include relevant files from discovery
        for file_path in relevant_files.likely_affected[:5]:
            if not any(p.file_path == file_path for p in patches):
                patches.append(FilePatch(
                    file_path=file_path,
                    operation="modify",
                    change_description=f"Review and apply changes if needed",
                ))
        
        plan = PatchPlan(
            root_cause_analysis=plan_dict.get("root_cause", response[:500]),
            patch_strategy=plan_dict.get("strategy", "Apply targeted fixes"),
            patches=patches,
            expected_verification_steps=plan_dict.get("verification_steps", []),
            risks=plan_dict.get("risks", []),
        )
        
        return plan
    
    def _generate_code_patch(self, patch: FilePatch, original_content: str) -> str:
        """Use AI to generate code patch for file modification"""
        logger.debug(f"Generating code patch for {patch.file_path}")
        
        prompt = f"""
You are an expert code engineer. Your task is to modify a file to fix a production issue.

FILE: {patch.file_path}
CHANGE DESCRIPTION: {patch.change_description}

ORIGINAL FILE:
```
{original_content[:2000]}  # Truncate to avoid token limits
```

REQUIREMENTS:
1. Minimal change - only fix the actual problem
2. Preserve existing code structure and style
3. Add helpful comments explaining the change
4. Do NOT rewrite the entire file unless absolutely necessary
5. Return ONLY the complete modified file content, nothing else

Generate the fixed file:
"""
        
        response = self.provider.generate(prompt)
        
        # Try to extract code from markdown blocks
        if "```" in response:
            start = response.find("```") + 3
            end = response.rfind("```")
            if start < end:
                response = response[start:end].strip()
                # Remove language specifier if present
                if response.startswith(("python", "javascript", "java", "go", "rust")):
                    response = response.split('\n', 1)[1]
        
        return response
    
    def _generate_new_file(self, patch: FilePatch) -> str:
        """Use AI to generate new file content"""
        logger.debug(f"Generating new file: {patch.file_path}")
        
        prompt = f"""
Generate a new {patch.file_path} file that will help fix the production issue.

DESCRIPTION: {patch.change_description}

Requirements:
1. Production-ready code
2. Proper error handling
3. Clear structure and comments
4. Return ONLY the complete file content, nothing else

Generate the file:
"""
        
        response = self.provider.generate(prompt)
        
        # Clean up response
        if "```" in response:
            start = response.find("```") + 3
            end = response.rfind("```")
            if start < end:
                response = response[start:end].strip()
                if response.startswith(("python", "javascript", "java", "go", "rust")):
                    response = response.split('\n', 1)[1]
        
        return response
    
    def _extract_json_from_response(self, response: str) -> Dict:
        """Try to extract JSON from AI response"""
        try:
            # Try direct JSON parse
            return json.loads(response)
        except json.JSONDecodeError:
            # Try to find JSON block in response
            if "{" in response and "}" in response:
                start = response.find("{")
                end = response.rfind("}") + 1
                try:
                    return json.loads(response[start:end])
                except json.JSONDecodeError:
                    pass
            
            # Return empty dict if parsing fails
            return {}
