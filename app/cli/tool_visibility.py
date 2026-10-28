"""
Visible Tool Loop for DeV.

Makes agent reasoning and tool execution transparent to users.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class ToolEvent:
    """A single visible tool action."""

    name: str
    description: str
    status: str  # "running" | "complete" | "failed"
    output: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ReasoningExplanation:
    """Explains why a path is chosen."""

    hypothesis: str
    likely_causes: List[str] = field(default_factory=list)
    investigation_steps: List[str] = field(default_factory=list)


class ToolVisibilityLayer:
    """Shows tool execution in real-time with professional output."""

    def __init__(self, emit_fn: Callable[[str], None]):
        """
        Initialize with output emitter.

        Args:
            emit_fn: callable that prints visible output (e.g., print)
        """
        self.emit = emit_fn
        self.current_tools: List[ToolEvent] = []

    def show_reasoning(self, explanation: ReasoningExplanation) -> None:
        """Display reasoning before action."""
        lines = [f"Likely causes:", ""]
        lines.extend(f"• {cause}" for cause in explanation.likely_causes)
        if explanation.investigation_steps:
            lines.append("")
            lines.append("Investigation strategy:")
            lines.extend(f"• {step}" for step in explanation.investigation_steps)
        self.emit("\n".join(lines))
        self.emit("")

    def start_tool(self, tool_name: str, description: str) -> None:
        """Show tool starting."""
        self.emit(f"● {description}")
        self.current_tools.append(ToolEvent(tool_name, description, "running"))

    def complete_tool(self, tool_name: str, output: str = "") -> None:
        """Mark tool complete."""
        for event in self.current_tools:
            if event.name == tool_name:
                event.status = "complete"
                event.output = output
                break

    def fail_tool(self, tool_name: str, error: str) -> None:
        """Mark tool failed."""
        for event in self.current_tools:
            if event.name == tool_name:
                event.status = "failed"
                event.error = error
                self.emit(f"  ⚠ Failed: {error}")
                break

    def show_summary(self, message: str) -> None:
        """Show summary after tools run."""
        self.emit("")
        self.emit(message)
        self.emit("")

    def show_structured_output(self, title: str, items: List[str]) -> None:
        """Show structured output (e.g., tech stack, files)."""
        self.emit(title)
        for item in items:
            self.emit(f"• {item}")
        self.emit("")

    def show_execution_step(self, step: str) -> None:
        """Show a single execution step."""
        self.emit(f"● {step}")

    def show_execution_complete(self, summary: str) -> None:
        """Show execution complete summary."""
        self.emit("")
        self.emit(summary)
        self.emit("")

    def show_verification_step(self, description: str, status: str) -> None:
        """Show verification step."""
        symbol = "✓" if status == "pass" else "✗" if status == "fail" else "⏳"
        self.emit(f"  {symbol} {description}")

    def show_failure_explanation(self, title: str, details: List[str], next_options: List[str]) -> None:
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


class VisibleRepositoryIntelligence:
    """Repository inspection with visibility."""

    def __init__(self, repo_intel, visibility: ToolVisibilityLayer):
        self.intel = repo_intel
        self.visibility = visibility

    def inspect_tech_stack(self) -> Dict[str, Any]:
        """Inspect tech stack with visible steps."""
        self.visibility.start_tool("read_package", "Reading package.json")
        pkg = self.intel.inspect_package_json()
        self.visibility.complete_tool("read_package")

        self.visibility.start_tool("read_pyproject", "Reading pyproject.toml")
        pyproj = self.intel.inspect_pyproject()
        self.visibility.complete_tool("read_pyproject")

        self.visibility.start_tool("detect_frameworks", "Detecting frameworks")
        frameworks = self.intel.detect_frameworks(pkg, pyproj)
        self.visibility.complete_tool("detect_frameworks", ", ".join(frameworks))

        return {
            "package": pkg,
            "pyproject": pyproj,
            "frameworks": frameworks,
        }

    def inspect_project_structure(self) -> Dict[str, Any]:
        """Inspect structure with visible steps."""
        self.visibility.start_tool("list_folders", "Inspecting folder structure")
        folders = self.intel.inspect_folder_structure()
        self.visibility.complete_tool("list_folders", f"{len(folders)} top-level items")

        self.visibility.start_tool("detect_deploy", "Looking for deployment configs")
        deploy = self.intel.detect_deploy_configs()
        self.visibility.complete_tool("detect_deploy", f"{len(deploy)} config(s) found")

        return {
            "folders": folders,
            "deploy_configs": deploy,
        }

    def inspect_auth_flow(self) -> Dict[str, Any]:
        """Inspect auth with visible steps."""
        self.visibility.start_tool("discover_auth", "Searching for auth-related files")
        auth_files = self.intel.discover_auth_files()
        self.visibility.complete_tool("discover_auth", f"{len(auth_files)} file(s) found")

        return {
            "auth_files": auth_files,
        }
