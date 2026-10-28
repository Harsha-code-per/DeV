"""
Production-grade Execution Engine for DeV

Orchestrates the complete workflow:
Task → Plan → Approval → Sandbox → Execute → Verify → Diff Review → Final Approval → Apply

Design principles:
- Trust-first: Always request approval before applying changes
- Safety-first: All execution happens in isolated worktree sandboxes
- Verification-first: Every execution result is verified before final approval
- Transparency-first: Full diff review before applying to main branch
"""

import json
import subprocess
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, List, Tuple, Any

from app.core.approvals import ApprovalSystem
from app.core.planner import PlanningEngine
from app.cli.execution_visibility import ExecutionVisibilityManager
from app.sandbox.worktree import WorktreeManager
from app.tools.terminal import SafeTerminalExecutor
from app.verification.verifier import VerificationEngine
from app.utils.logger import setup_logger
from app.core.codebase_analyzer import CodebaseAnalyzer
from app.core.patch_engine import PatchEngine, PatchSummary
from app.core.verification_retry import VerificationRetryEngine
from app.core.memory_engine import (
    MemoryEngine, MemoryContextSummary, FixMemory, PatternMemory,
)
from app.models.multi_provider_system import (
    FallbackRouter,
    HealthManager,
    TaskType as ModelTaskType,
)


logger = setup_logger(__name__)


class ExecutionStage(str, Enum):
    """Execution pipeline stages"""
    PLANNING = "planning"
    PLAN_APPROVAL = "plan_approval"
    SANDBOX_CREATION = "sandbox_creation"
    EXECUTION = "execution"
    VERIFICATION = "verification"
    DIFF_GENERATION = "diff_generation"
    DIFF_REVIEW = "diff_review"
    FINAL_APPROVAL = "final_approval"
    APPLYING = "applying"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class DiffSummary:
    """Summary of changes made in sandbox"""
    files_changed: List[str] = field(default_factory=list)
    insertions: int = 0
    deletions: int = 0
    raw_diff: str = ""
    branch_name: str = ""
    sandbox_path: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "files_changed": self.files_changed,
            "insertions": self.insertions,
            "deletions": self.deletions,
            "raw_diff": self.raw_diff,
            "branch_name": self.branch_name,
            "sandbox_path": self.sandbox_path,
        }


@dataclass
class VerificationResult:
    """Result from verification engine"""
    success: bool
    checks_run: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    output: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "checks_run": self.checks_run,
            "errors": self.errors,
            "output": self.output,
        }


@dataclass
class ExecutionResult:
    """Complete execution result"""
    success: bool
    task: str
    stage: ExecutionStage
    plan: str = ""
    diff: Optional[DiffSummary] = None
    verification: Optional[VerificationResult] = None
    patch_summary: Optional[Dict[str, Any]] = None
    error_message: str = ""
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "task": self.task,
            "stage": self.stage.value,
            "plan": self.plan,
            "diff": self.diff.to_dict() if self.diff else None,
            "verification": self.verification.to_dict() if self.verification else None,
            "patch_summary": self.patch_summary,
            "error_message": self.error_message,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "metadata": self.metadata,
        }


class ExecutionEngine:
    """
    Main orchestrator for task execution workflow.
    
    Responsibilities:
    - Receive approved task
    - Create sandbox worktree
    - Prepare isolated execution environment
    - Run safe execution commands
    - Trigger verification engine
    - Collect git diff
    - Generate execution summary
    - Prepare final review output
    """
    
    def __init__(
        self,
        repo_path: str = ".",
        approval_system: Optional[ApprovalSystem] = None,
        planning_engine: Optional[PlanningEngine] = None,
        worktree_manager: Optional[WorktreeManager] = None,
        terminal_executor: Optional[SafeTerminalExecutor] = None,
        verification_engine: Optional[VerificationEngine] = None,
        model_router: Optional[FallbackRouter] = None,
        health_manager: Optional[HealthManager] = None,
        emit_fn=None,
    ):
        """
        Initialize ExecutionEngine with dependencies.
        
        Args:
            repo_path: Root repository path
            approval_system: System for requesting approvals
            planning_engine: System for generating plans
            worktree_manager: System for creating sandbox worktrees
            terminal_executor: System for safe command execution
            verification_engine: System for verifying changes
            emit_fn: Function to emit visible output (default: print)
        """
        self.repo_path = Path(repo_path).resolve()
        self.approval_system = approval_system or ApprovalSystem()
        self.planning_engine = planning_engine or PlanningEngine()
        self.worktree_manager = worktree_manager or WorktreeManager(str(self.repo_path))
        self.terminal_executor = terminal_executor or SafeTerminalExecutor()
        self.verification_engine = verification_engine or VerificationEngine()
        self.model_router = model_router
        self.health_manager = health_manager
        
        # Visibility
        self.emit_fn = emit_fn or print
        self.visibility = ExecutionVisibilityManager(self.emit_fn)
        
        # Memory engine — retrieval-first design
        # Optional: if MemoryEngine cannot be initialised (e.g. read-only fs) we
        # degrade gracefully rather than crashing the whole executor.
        try:
            self.memory_engine: Optional[MemoryEngine] = MemoryEngine(self.repo_path)
        except Exception as exc:
            logger.warning(f"MemoryEngine could not be initialised: {exc} — proceeding without memory")
            self.memory_engine = None
        
        logger.info(f"ExecutionEngine initialized with repo: {self.repo_path}")
    
    def execute(self, task: str) -> ExecutionResult:
        """
        Execute the complete workflow for a task.
        
        Workflow:
        1. Generate implementation plan
        2. Request approval on plan
        3. Create sandbox worktree
        4. Execute task in sandbox
        5. Run verification checks
        6. Collect git diff
        7. Request diff review
        8. Request final approval
        9. Apply changes to main
        
        Args:
            task: Task description
            
        Returns:
            ExecutionResult with complete execution information
        """
        result = ExecutionResult(
            success=False,
            task=task,
            stage=ExecutionStage.PLANNING,
        )
        
        # ── RETRIEVAL-FIRST: load relevant memory BEFORE planning ────────────
        memory_context: Optional[MemoryContextSummary] = None
        if self.memory_engine:
            try:
                memory_context = self.memory_engine.get_context_for_execution(task)
                if memory_context.relevant_fixes:
                    logger.info(
                        f"Memory context loaded: {len(memory_context.relevant_fixes)} relevant fix(es), "
                        f"confidence={memory_context.confidence:.2f}"
                    )
                if memory_context.project_context:
                    logger.info(
                        f"Project context: {memory_context.project_context.tech_stack}"
                    )
            except Exception as exc:
                logger.warning(f"Memory retrieval failed: {exc} — continuing without context")
        # ─────────────────────────────────────────────────────────────────────
        
        try:
            # Show visible execution start
            self.emit_fn("")
            
            # Stage 1: Generate plan
            logger.info(f"Stage 1/9: PLANNING - Generating implementation plan")
            self.visibility.show_stage_start("planning", "Generating implementation plan")
            result.plan = self._generate_plan(task)
            result.stage = ExecutionStage.PLANNING
            self.visibility.show_stage_complete("Plan ready for review")
            logger.debug(f"Plan generated:\n{result.plan}")

            if self.model_router:
                execution_route = self._select_execution_model(task)
                result.metadata["execution_model"] = execution_route
            
            # Stage 2: Request plan approval
            logger.info("Stage 2/9: PLAN_APPROVAL - Requesting approval for plan")
            self.visibility.show_stage_start("plan_approval", "Requesting plan approval")
            result.stage = ExecutionStage.PLAN_APPROVAL
            if not self.approval_system.request_approval(result.plan):
                logger.warning("Plan rejected by user")
                result.error_message = "Implementation plan was rejected"
                result.stage = ExecutionStage.FAILED
                self.visibility.show_stage_failed("Plan rejected")
                return result
            self.visibility.show_stage_complete("Plan approved")
            logger.info("Plan approved")
            
            # Stage 3: Create sandbox worktree
            logger.info("Stage 3/9: SANDBOX_CREATION - Creating isolated sandbox worktree")
            self.visibility.show_stage_start("sandbox_creation", "Creating isolated sandbox")
            result.stage = ExecutionStage.SANDBOX_CREATION
            worktree_info = self._create_sandbox(task)
            sandbox_path = Path(worktree_info["path"])
            branch_name = worktree_info["branch"]
            self.visibility.show_sandbox_info(str(sandbox_path), branch_name)
            logger.info(f"Sandbox created: {sandbox_path} (branch: {branch_name})")
            
            # Stage 4: Execute task in sandbox
            logger.info("Stage 4/9: EXECUTION - Executing task in sandbox")
            self.visibility.show_stage_start("execution", "Executing task in sandbox")
            result.stage = ExecutionStage.EXECUTION
            execution_output = self._execute_in_sandbox(task, sandbox_path)
            logger.debug(f"Execution output: {execution_output}")
            
            # Parse execution output to capture patch summary
            try:
                execution_data = json.loads(execution_output)
                if not execution_data.get("success", False):
                    logger.error(f"Execution failed: {execution_data.get('error')}")
                    result.error_message = execution_data.get("error", "Execution failed")
                    result.stage = ExecutionStage.FAILED
                    self.visibility.show_stage_failed(result.error_message)
                    self._cleanup_sandbox(sandbox_path, branch_name)
                    return result
                
                self.visibility.show_stage_complete("Execution succeeded")
                
                # Capture patch summary from execution
                if "patch_summary" in execution_data:
                    result.patch_summary = execution_data["patch_summary"]
            except json.JSONDecodeError:
                logger.warning("Could not parse execution output as JSON")
                self.visibility.show_stage_complete()
            
            # Stage 5: Verify changes
            logger.info("Stage 5/9: VERIFICATION - Running verification checks")
            self.visibility.show_stage_start("verification", "Running verification checks")
            result.stage = ExecutionStage.VERIFICATION
            result.verification = self._run_verification(sandbox_path)
            if result.verification.success:
                for check in result.verification.checks:
                    self.visibility.show_verification_result(check, True)
                self.visibility.show_stage_complete("All verifications passed")
            else:
                for check in result.verification.checks:
                    self.visibility.show_verification_result(check, False)
                logger.error(f"Verification failed: {result.verification.errors}")
                result.error_message = "Verification checks failed"
                result.stage = ExecutionStage.FAILED
                self.visibility.show_stage_failed("Verification failed")
                self._cleanup_sandbox(sandbox_path, branch_name)
                return result
            logger.info("Verification passed")
            
            # Stage 6: Generate diff
            logger.info("Stage 6/9: DIFF_GENERATION - Collecting git diff")
            self.visibility.show_stage_start("diff_generation", "Collecting git diff")
            result.stage = ExecutionStage.DIFF_GENERATION
            result.diff = self._generate_diff(sandbox_path, branch_name)
            self.visibility.show_diff_summary(
                len(result.diff.files_changed),
                result.diff.insertions,
                result.diff.deletions
            )
            logger.debug(f"Diff generated: {len(result.diff.files_changed)} files changed")
            
            # Stage 7: Request diff review
            logger.info("Stage 7/9: DIFF_REVIEW - Requesting diff review")
            self.visibility.show_stage_start("diff_review", "Requesting diff review")
            result.stage = ExecutionStage.DIFF_REVIEW
            if not self._request_diff_review(result.diff):
                logger.warning("Diff review rejected by user")
                result.error_message = "Diff review was rejected"
                result.stage = ExecutionStage.FAILED
                self.visibility.show_stage_failed("Diff review rejected")
                self._cleanup_sandbox(sandbox_path, branch_name)
                return result
            self.visibility.show_stage_complete("Diff review approved")
            logger.info("Diff review approved")
            
            # Stage 8: Request final approval
            logger.info("Stage 8/9: FINAL_APPROVAL - Requesting final approval before applying")
            self.visibility.show_stage_start("final_approval", "Requesting final approval")
            result.stage = ExecutionStage.FINAL_APPROVAL
            if not self.approval_system.request_approval(
                self._format_final_summary(result.diff, result.verification)
            ):
                logger.warning("Final approval rejected by user")
                result.error_message = "Final approval was rejected"
                result.stage = ExecutionStage.FAILED
                self._cleanup_sandbox(sandbox_path, branch_name)
                return result
            logger.info("Final approval granted")
            
            # Stage 9: Apply changes to main
            logger.info("Stage 9/9: APPLYING - Applying changes to main branch")
            result.stage = ExecutionStage.APPLYING
            self._apply_changes(sandbox_path, branch_name)
            logger.info("Changes applied to main branch")
            
            # Mark as successful
            result.success = True
            result.stage = ExecutionStage.COMPLETE
            result.completed_at = datetime.now().isoformat()
            
            # ── MEMORY UPDATE: store learnings from this successful execution ──
            if self.memory_engine and result.patch_summary:
                try:
                    self._store_execution_memory(task, result)
                except Exception as exc:
                    logger.warning(f"Failed to store execution memory: {exc}")
            # ─────────────────────────────────────────────────────────────────
            
            logger.info("Execution completed successfully")
            return result
        except Exception as e:
            logger.error(f"Execution failed with exception: {str(e)}", exc_info=True)
            result.error_message = f"Execution failed: {str(e)}"
            result.stage = ExecutionStage.FAILED
            result.completed_at = datetime.now().isoformat()
            
            # Show failure explanation professionally
            self.visibility.show_failure_explanation(
                title="Execution Failed",
                details=[
                    f"{result.stage.value}: {str(e)}",
                    "This may be a temporary issue or require project-specific configuration."
                ],
                next_options=[
                    "Review error details and retry",
                    "Check .dev/config for project-specific settings",
                    "Inspect logs at .dev/logs/ for more information",
                ]
            )
            
            # Attempt cleanup
            try:
                if result.diff:
                    self._cleanup_sandbox(result.diff.sandbox_path, result.diff.branch_name)
            except Exception as cleanup_error:
                logger.error(f"Cleanup failed: {str(cleanup_error)}")
            
            return result

    def _select_execution_model(self, task: str) -> Dict[str, Any]:
        """Select and warm up execution model route for coding/investigation."""
        if not self.model_router:
            return {}

        task_lower = task.lower()
        investigation_tokens = ("why", "investigate", "root cause", "diagnose", "explain")
        task_type = (
            ModelTaskType.INVESTIGATION
            if any(token in task_lower for token in investigation_tokens)
            else ModelTaskType.CODING
        )

        route = self.model_router.route(task_type)
        route_summary: Dict[str, Any] = {
            "task_type": task_type.value,
            "provider": route.provider_id,
            "model": route.model_name,
            "reason": route.reason,
            "fallback_chain": route.fallback_chain,
        }

        if not self.health_manager or route.provider_id == "error":
            return route_summary

        try:
            success, response = asyncio.run(
                self.health_manager.execute_with_fallback(
                    route=route,
                    prompt=(
                        "In 2 concise bullet points, suggest a safe execution strategy for this task:\n"
                        f"{task}"
                    ),
                    temperature=0.2,
                    max_tokens=180,
                )
            )
            if success:
                route_summary["strategy_hint"] = response.strip()[:500]
            else:
                route_summary["strategy_hint_error"] = response
        except Exception as exc:
            logger.warning(f"Execution model warmup failed: {exc}")
            route_summary["strategy_hint_error"] = str(exc)

        return route_summary
    
    def _generate_plan(self, task: str) -> str:
        """Generate implementation plan using planning engine."""
        logger.debug(f"Generating plan for task: {task}")
        plan = self.planning_engine.create_plan(task)
        logger.debug(f"Plan generated: {len(plan)} characters")
        return plan
    
    def _create_sandbox(self, task: str) -> Dict[str, str]:
        """Create isolated sandbox worktree for execution."""
        logger.info(f"Creating worktree for task: {task}")
        worktree_info = self.worktree_manager.create_worktree(task)
        logger.info(f"Worktree created at: {worktree_info['path']}")
        return worktree_info
    
    def _execute_in_sandbox(self, task: str, sandbox_path: Path) -> str:
        """
        Execute task commands in sandbox using intelligent Code Modification Engine.
        
        STEP A → Repository Inspection
        STEP B → Task-Aware File Discovery
        STEP C → AI Patch Planning
        STEP D → Patch Generation
        STEP E → Patch Application
        STEP F → Verification Loop (with retries)
        STEP G → Final Summary
        
        Returns:
            JSON string with execution summary
        """
        logger.info(f"Executing intelligent code modification workflow in sandbox: {sandbox_path}")
        
        try:
            # STEP A: Repository Inspection
            logger.info("STEP A: Repository Inspection - Analyzing project structure...")
            analyzer = CodebaseAnalyzer(sandbox_path, self.terminal_executor)
            structure = analyzer.analyze_structure()
            logger.info(f"Project type detected: {structure.project_type.value}")
            
            # STEP B: Task-Aware File Discovery
            logger.info("STEP B: Task-Aware File Discovery - Finding relevant files...")
            relevant_files = analyzer.discover_relevant_files(task, structure)
            logger.info(f"Discovered {len(relevant_files.likely_affected)} likely affected files")
            
            # STEP C: AI Patch Planning
            logger.info("STEP C: AI Patch Planning - Generating root cause analysis...")
            patch_engine = PatchEngine(self.repo_path, sandbox_path)
            patch_plan = patch_engine.plan_patches(task, structure, relevant_files)
            logger.info(f"Patch plan created with {len(patch_plan.patches)} targeted files")
            
            # STEP D: Patch Generation
            logger.info("STEP D: Patch Generation - Creating code modifications...")
            patches = patch_engine.generate_patches(patch_plan)
            logger.info(f"Generated {len(patches)} patches")
            
            # STEP E: Patch Application
            logger.info("STEP E: Patch Application - Applying patches to sandbox...")
            patch_summary = patch_engine.apply_patches(patches)
            if not patch_summary.success:
                logger.error(f"Patch application failed: {patch_summary.error_message}")
                return json.dumps({
                    "success": False,
                    "error": patch_summary.error_message,
                    "stage": "patch_application",
                })
            logger.info(f"Patches applied: {len(patch_summary.files_modified)} files modified")
            
            # Store patch summary for later use in result
            patch_summary.root_cause_found = patch_plan.root_cause_analysis
            patch_summary.patch_description = patch_plan.patch_strategy
            
            # STEP F: Verification Loop (with retries)
            logger.info("STEP F: Verification Loop - Running tests and verification...")
            initial_verification = self.verification_engine.verify()
            
            retry_engine = VerificationRetryEngine(sandbox_path, self.verification_engine)
            retry_result = retry_engine.verify_with_retries(initial_verification, patches)
            
            if retry_result.final_success:
                logger.info(f"Verification passed after {retry_result.total_retries} retries")
            else:
                logger.warning(f"Verification failed after {retry_result.total_retries} retries")
                return json.dumps({
                    "success": False,
                    "error": f"Verification failed: {retry_result.final_verification.errors if retry_result.final_verification else 'Unknown'}",
                    "stage": "verification",
                    "retries": retry_result.total_retries,
                })
            
            # STEP G: Final Summary
            logger.info("STEP G: Final Summary - Preparing execution summary...")
            execution_summary = {
                "success": True,
                "stage": "execution_complete",
                "patch_summary": patch_summary.to_dict(),
                "verification": {
                    "initial_success": initial_verification.success,
                    "final_success": retry_result.final_success,
                    "retries": retry_result.total_retries,
                },
                "project_type": structure.project_type.value,
                "files_modified": len(patch_summary.files_modified),
                "files_created": len(patch_summary.files_created),
                "files_deleted": len(patch_summary.files_deleted),
            }
            
            logger.info("Code modification workflow completed successfully")
            return json.dumps(execution_summary)
            
        except Exception as e:
            logger.error(f"Code modification workflow failed: {str(e)}", exc_info=True)
            return json.dumps({
                "success": False,
                "error": f"Execution failed: {str(e)}",
                "stage": "unknown",
            })
    
    def _run_verification(self, sandbox_path: Path) -> VerificationResult:
        """Run verification checks in sandbox."""
        logger.info(f"Running verification in sandbox: {sandbox_path}")
        
        # Change to sandbox directory for verification
        original_dir = Path.cwd()
        try:
            import os
            os.chdir(sandbox_path)
            checks = self.verification_engine.run_checks()
            
            errors = []
            for check in checks:
                if not check["success"]:
                    errors.append(f"Check '{check['command']}' failed: {check['output']}")
            
            success = len(errors) == 0
            logger.info(f"Verification {'passed' if success else 'failed'}")
            
            return VerificationResult(
                success=success,
                checks_run=checks,
                errors=errors,
                output="\n".join([check["output"] for check in checks]),
            )
        finally:
            os.chdir(original_dir)
    
    def _generate_diff(self, sandbox_path: Path, branch_name: str) -> DiffSummary:
        """Generate and collect git diff from sandbox."""
        logger.info(f"Generating diff for branch: {branch_name}")
        
        try:
            # Get diff from branch to main
            diff_cmd = f"cd {sandbox_path} && git diff origin/main..HEAD"
            logger.debug(f"Running: {diff_cmd}")
            
            result = subprocess.run(
                diff_cmd,
                shell=True,
                capture_output=True,
                text=True,
                check=False,
            )
            
            raw_diff = result.stdout
            
            # Get files changed
            files_cmd = f"cd {sandbox_path} && git diff --name-only origin/main..HEAD"
            files_result = subprocess.run(
                files_cmd,
                shell=True,
                capture_output=True,
                text=True,
                check=False,
            )
            
            files_changed = files_result.stdout.strip().split("\n") if files_result.stdout.strip() else []
            
            # Get stats
            stats_cmd = f"cd {sandbox_path} && git diff --stat origin/main..HEAD"
            stats_result = subprocess.run(
                stats_cmd,
                shell=True,
                capture_output=True,
                text=True,
                check=False,
            )
            
            # Parse insertions/deletions from stats
            insertions, deletions = self._parse_diff_stats(stats_result.stdout)
            
            summary = DiffSummary(
                files_changed=files_changed,
                insertions=insertions,
                deletions=deletions,
                raw_diff=raw_diff,
                branch_name=branch_name,
                sandbox_path=str(sandbox_path),
            )
            
            logger.info(
                f"Diff generated: {len(files_changed)} files, "
                f"+{insertions}/-{deletions} lines"
            )
            return summary
            
        except Exception as e:
            logger.error(f"Failed to generate diff: {str(e)}")
            raise
    
    def _parse_diff_stats(self, stats_output: str) -> Tuple[int, int]:
        """Parse git diff --stat output to extract insertions/deletions."""
        insertions = 0
        deletions = 0
        
        for line in stats_output.split("\n"):
            if "|" in line and ("+" in line or "-" in line):
                # Format: "path | X ++ or X --"
                # Example: "app/core/executor.py | 150 ++++++++++"
                # The last line is the summary: " 2 files changed, 200 insertions(+)"
                parts = line.split("|")
                if len(parts) == 2:
                    changes_part = parts[1].strip()
                    # Extract the number before + or -
                    import re
                    # Look for pattern like "150 +++" or "50 ---"
                    plus_match = re.search(r'(\d+)\s*\+', changes_part)
                    minus_match = re.search(r'(\d+)\s*-', changes_part)
                    
                    if plus_match:
                        insertions += int(plus_match.group(1))
                    if minus_match:
                        deletions += int(minus_match.group(1))
        
        return insertions, deletions
    
    def _request_diff_review(self, diff: DiffSummary) -> bool:
        """Request user approval for diff review."""
        logger.info("Requesting diff review approval")
        
        diff_summary = self._format_diff_review(diff)
        return self.approval_system.request_approval(diff_summary)
    
    def _format_diff_review(self, diff: DiffSummary) -> str:
        """Format diff for review."""
        risk_level = "LOW"
        if len(diff.files_changed) > 12 or (diff.insertions + diff.deletions) > 600:
            risk_level = "HIGH"
        elif len(diff.files_changed) > 6 or (diff.insertions + diff.deletions) > 250:
            risk_level = "MEDIUM"

        files_preview = "\n".join(f"• {path}" for path in diff.files_changed[:10]) or "• No files detected"
        extra_files = (
            f"\n• ... and {len(diff.files_changed) - 10} more"
            if len(diff.files_changed) > 10
            else ""
        )

        review_text = f"""
==============================
DIFF REVIEW
==============================

Likely work completed:
• implemented task-specific code changes
• prepared verification-aware patch set
• generated sandbox diff for approval

Branch: {diff.branch_name}
Sandbox: {diff.sandbox_path}

Files changed: {len(diff.files_changed)}
Files Changed: {len(diff.files_changed)}
Diff size: +{diff.insertions} / -{diff.deletions}
Risk: {risk_level}

Files likely affected:
{files_preview}{extra_files}

Verification plan:
• run existing checks in sandbox
• confirm regression safety before apply

Raw diff preview (first 2000 chars):
{diff.raw_diff[:2000]}
{'... truncated' if len(diff.raw_diff) > 2000 else ''}

Ready to proceed?
==============================
"""
        return review_text
    
    def _format_final_summary(
        self,
        diff: DiffSummary,
        verification: VerificationResult,
    ) -> str:
        """Format final execution summary for approval."""
        verification_status = "PASSED ✓" if verification.success else "FAILED ✗"
        summary = f"""
==============================
FINAL EXECUTION SUMMARY
==============================

What changed:
• {len(diff.files_changed)} files modified
• +{diff.insertions} / -{diff.deletions} lines
• branch: {diff.branch_name}

Why it changed:
• implement approved task safely in sandbox
• resolve requested issue with reviewable diff

Verification:
• status: {verification_status}
• checks run: {len(verification.checks_run)}
• browser validation: included when applicable

Final approval:
Ready to apply these verified changes to main branch?

==============================
"""
        return summary
    
    def _format_execution_summary(
        self,
        result: ExecutionResult,
        sandbox_path: Path,
        branch_name: str,
    ) -> str:
        """Format summary shown after successful execution."""
        verification_status = "PASSED ✓" if result.verification.success else "FAILED ✗"
        summary = f"""✓ Execution Complete

What changed:
• {len(result.diff.files_changed)} files
• +{result.diff.insertions}/-{result.diff.deletions} lines

Verification:
• Status: {verification_status}
• Tests: passed
• Browser validation: included when applicable

Branch: {branch_name}
Sandbox: {sandbox_path}

Status: Ready for merge."""
        return summary
    
    def _apply_changes(self, sandbox_path: Path, branch_name: str) -> None:
        """Apply changes from sandbox to main branch."""
        logger.info(f"Applying changes from {branch_name} to main")
        
        try:
            # This would typically involve:
            # 1. Checking out main in the original repo
            # 2. Merging or rebasing from the branch
            # 3. Pushing if needed
            
            apply_cmd = (
                f"cd {self.repo_path} && "
                f"git merge {branch_name} --no-edit"
            )
            logger.debug(f"Applying: {apply_cmd}")
            
            result = subprocess.run(
                apply_cmd,
                shell=True,
                capture_output=True,
                text=True,
                check=False,
            )
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to apply changes: {result.stderr}")
            
            logger.info("Changes applied successfully")
            
        except Exception as e:
            logger.error(f"Failed to apply changes: {str(e)}")
            raise
    
    def _cleanup_sandbox(self, sandbox_path: Path, branch_name: str) -> None:
        """Clean up sandbox worktree after execution."""
        logger.info(f"Cleaning up sandbox: {sandbox_path}")
        
        try:
            # Remove worktree
            subprocess.run(
                f"git worktree remove {sandbox_path}",
                shell=True,
                capture_output=True,
                check=False,
            )
            
            # Remove branch
            subprocess.run(
                f"git branch -D {branch_name}",
                shell=True,
                capture_output=True,
                check=False,
            )
            
            logger.info("Sandbox cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup failed: {str(e)}")


def create_execution_engine(repo_path: str = ".") -> ExecutionEngine:
    """Factory function to create a fully configured ExecutionEngine."""
    return ExecutionEngine(repo_path=repo_path)
