"""
Data models for Elite CLI + Workflow System

Defines:
- TaskSize: Small, Medium, Large classification
- TaskType: Bug fix, feature, refactor, etc.
- NaturalTaskRequest: User input parsing
- ImplementationPlan: Markdown plan artifacts
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pathlib import Path


class TaskSize(Enum):
    """Task complexity classification"""
    SMALL = "small"       # < 30 minutes, 1-3 files
    MEDIUM = "medium"     # 30 mins - 2 hours, 3-10 files
    LARGE = "large"       # > 2 hours, 10+ files, needs planning


class TaskType(Enum):
    """Task category"""
    BUG_FIX = "bug_fix"
    FEATURE = "feature"
    REFACTOR = "refactor"
    OPTIMIZATION = "optimization"
    INVESTIGATION = "investigation"
    TEST = "test"
    DOCUMENTATION = "documentation"
    DEPLOYMENT = "deployment"
    UNKNOWN = "unknown"


class ApprovalLevel(Enum):
    """Risk level of changes"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class NaturalTaskRequest:
    """User's natural language task input"""
    
    raw_text: str                          # Original user input
    task_type: TaskType = TaskType.UNKNOWN
    task_size: TaskSize = TaskSize.SMALL
    confidence: float = 0.0                # 0.0-1.0
    keywords: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'raw_text': self.raw_text,
            'task_type': self.task_type.value,
            'task_size': self.task_size.value,
            'confidence': self.confidence,
            'keywords': self.keywords,
        }


@dataclass
class ImplementationPlan:
    """Markdown implementation plan for large tasks"""
    
    task_description: str
    task_type: TaskType
    hypothesis: str                       # What we think is wrong
    affected_files: List[str]
    proposed_changes: List[str]
    risks: List[str]
    verification_steps: List[str]
    estimated_time_minutes: int
    created_at: datetime = field(default_factory=datetime.now)
    
    # File output
    filename: Optional[str] = None        # .dev/plans/xxx.md
    
    def to_markdown(self) -> str:
        """Generate markdown representation"""
        lines = [
            "# Implementation Plan",
            "",
            f"**Task**: {self.task_description}",
            f"**Type**: {self.task_type.value}",
            f"**Created**: {self.created_at.isoformat()}",
            "",
            "## Hypothesis",
            f"{self.hypothesis}",
            "",
            "## Affected Files",
            *[f"- `{f}`" for f in self.affected_files],
            "",
            "## Proposed Changes",
            *[f"- {c}" for c in self.proposed_changes],
            "",
            "## Risks",
            *[f"- {r}" for r in self.risks],
            "",
            "## Verification Steps",
            *[f"1. {s}" for s, _ in enumerate(self.verification_steps, 1)],
            "",
            f"## Estimated Time",
            f"{self.estimated_time_minutes} minutes",
            "",
            "---",
            "",
            "**Status**: Awaiting approval",
        ]
        return "\n".join(lines)
    
    def save_to_file(self, dev_dir: Path) -> bool:
        """Save plan to .dev/plans/ directory"""
        try:
            plans_dir = dev_dir / "plans"
            plans_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            task_slug = self.task_description[:30].lower().replace(" ", "_")
            self.filename = f"{timestamp}_{task_slug}_plan.md"
            
            filepath = plans_dir / self.filename
            content = self.to_markdown()
            
            filepath.write_text(content)
            return True
        except Exception as e:
            print(f"Error saving plan: {e}")
            return False


@dataclass
class ApprovalRequest:
    """Request for user approval before execution"""
    
    title: str                            # "Ready to fix build error?"
    description: str                      # What will happen
    risk_level: ApprovalLevel
    changed_files: List[str]              # Files that will change
    verification_results: Optional[Dict[str, Any]] = None
    browser_results: Optional[Dict[str, Any]] = None
    
    def summary(self) -> str:
        """Generate approval summary"""
        lines = [
            f"📋 {self.title}",
            "",
            f"Risk Level: {self.risk_level.value.upper()}",
            "",
            "Changed Files:",
            *[f"  • {f}" for f in self.changed_files[:10]],
        ]
        
        if len(self.changed_files) > 10:
            lines.append(f"  ... and {len(self.changed_files) - 10} more")
        
        if self.verification_results:
            lines.extend([
                "",
                "Verification:",
                f"  ✓ Build: {self.verification_results.get('build', 'unknown')}",
                f"  ✓ Tests: {self.verification_results.get('tests', 'unknown')}",
            ])
        
        if self.browser_results:
            lines.extend([
                "",
                "Browser Validation:",
                f"  ✓ Frontend: {self.browser_results.get('status', 'untested')}",
            ])
        
        return "\n".join(lines)


@dataclass
class ExecutionContext:
    """Context for task execution"""
    
    task_request: NaturalTaskRequest
    project_root: Path
    dev_dir: Path
    plan: Optional[ImplementationPlan] = None
    approval: Optional[ApprovalRequest] = None
    
    def is_small_task(self) -> bool:
        """Check if task is small"""
        return self.task_request.task_size == TaskSize.SMALL
    
    def is_large_task(self) -> bool:
        """Check if task is large"""
        return self.task_request.task_size == TaskSize.LARGE


@dataclass
class CLIState:
    """Current state of CLI session"""
    
    active: bool = True
    current_task: Optional[NaturalTaskRequest] = None
    current_execution: Optional[ExecutionContext] = None
    model_name: str = "default"
    provider: str = "default"
    branch: Optional[str] = None
    project_name: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'active': self.active,
            'model_name': self.model_name,
            'provider': self.provider,
            'branch': self.branch,
            'project_name': self.project_name,
        }
