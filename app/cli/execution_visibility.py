"""
Execution Visibility for DeV.

Shows execution stage progress and results in real-time.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Optional


@dataclass
class ExecutionVisibilityState:
    """Tracks visible execution progress."""

    current_stage: str
    stages_completed: List[str]
    verification_results: List[str]


class ExecutionVisibilityManager:
    """Manages visible execution flow."""

    def __init__(self, emit_fn: Callable[[str], None]):
        self.emit = emit_fn
        self.state = ExecutionVisibilityState(
            current_stage="",
            stages_completed=[],
            verification_results=[],
        )

    def show_stage_start(self, stage_name: str, description: str) -> None:
        """Show execution stage starting."""
        self.state.current_stage = stage_name
        self.emit(f"● {description}")

    def show_stage_complete(self, result: str = "") -> None:
        """Show stage complete."""
        self.state.stages_completed.append(self.state.current_stage)
        if result:
            self.emit(f"  ✓ {result}")

    def show_stage_failed(self, error: str) -> None:
        """Show stage failed."""
        self.emit(f"  ✗ Failed: {error}")

    def show_sandbox_info(self, path: str, branch: str) -> None:
        """Show sandbox creation result."""
        self.emit(f"  Sandbox: {branch} at {path}")

    def show_execution_output(self, title: str, output: str) -> None:
        """Show execution output."""
        self.emit(f"\n{title}:")
        self.emit(output)

    def show_verification_start(self, check_name: str) -> None:
        """Show verification starting."""
        self.emit(f"  Testing: {check_name}")

    def show_verification_result(self, check_name: str, passed: bool, detail: str = "") -> None:
        """Show verification result."""
        symbol = "✓" if passed else "✗"
        msg = f"  {symbol} {check_name}"
        if detail:
            msg += f" ({detail})"
        self.emit(msg)
        self.state.verification_results.append(f"{check_name}: {'PASS' if passed else 'FAIL'}")

    def show_diff_summary(self, files_changed: int, insertions: int, deletions: int) -> None:
        """Show diff summary."""
        self.emit(f"\n📝 Changes:")
        self.emit(f"  • {files_changed} files changed")
        self.emit(f"  • +{insertions} insertions")
        self.emit(f"  • -{deletions} deletions")

    def show_approval_ready(self) -> None:
        """Show ready for final approval."""
        self.emit(f"\nReady for final approval and merge.")
        self.emit("")

    def show_execution_summary(self, summary: str) -> None:
        """Show final execution summary."""
        self.emit(f"\n{summary}")
        self.emit("")

    def show_failure_explanation(self, title: str, details: list, next_options: list) -> None:
        """Show professional failure explanation."""
        self.emit("")
        self.emit(f"❌ {title}")
        self.emit("")
        self.emit("What failed:")
        for detail in details:
            self.emit(f"  • {detail}")
        self.emit("")
        self.emit("Next recommended steps:")
        for option in next_options:
            self.emit(f"  • {option}")
        self.emit("")
