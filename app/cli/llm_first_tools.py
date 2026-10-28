"""
Tool Orchestration Layer for LLM-First Agent

Model can choose to use these tools:
- read_file(path)
- list_files(pattern)
- search_codebase(query)
- inspect_config()
- git_status()
- run_tests()
- browser_validate()
- create_plan()
- generate_patch()
- execute_command()

Tools return structured results that get fed back to the model.
"""

from __future__ import annotations

import json
import re
import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.utils.logger import get_logger

logger = get_logger(__name__)


class ToolName(Enum):
    """Available tools"""
    READ_FILE = "read_file"
    LIST_FILES = "list_files"
    SEARCH_CODEBASE = "search_codebase"
    INSPECT_CONFIG = "inspect_config"
    GIT_STATUS = "git_status"
    RUN_TESTS = "run_tests"
    BROWSER_VALIDATE = "browser_validate"
    CREATE_PLAN = "create_plan"
    GENERATE_PATCH = "generate_patch"
    EXECUTE_COMMAND = "execute_command"


@dataclass
class ToolResult:
    """Result from tool execution"""
    tool_name: str
    success: bool
    output: str
    error: Optional[str] = None
    metadata: Dict[str, Any] = None

    def to_prompt_string(self) -> str:
        """Format for including in LLM prompt"""
        if self.success:
            return f"✓ {self.tool_name}\n{self.output}"
        else:
            return f"✗ {self.tool_name}: {self.error}"


class BaseTool(ABC):
    """Base class for all tools"""

    def __init__(self, project_root: Path):
        self.project_root = project_root

    @property
    @abstractmethod
    def name(self) -> str:
        """Tool name"""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Tool description"""
        pass

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        """Execute tool with given arguments"""
        pass


class ReadFileTool(BaseTool):
    """Read a file's contents"""

    @property
    def name(self) -> str:
        return "read_file"

    @property
    def description(self) -> str:
        return "Read a file's contents. Args: path (str)"

    async def execute(self, path: str) -> ToolResult:
        """Read file contents"""
        try:
            file_path = self.project_root / path
            if not file_path.exists():
                return ToolResult(
                    self.name, False, "", error=f"File not found: {path}"
                )

            if not file_path.is_file():
                return ToolResult(
                    self.name, False, "", error=f"Not a file: {path}"
                )

            content = file_path.read_text(encoding="utf-8", errors="replace")
            lines = content.split("\n")
            truncated = len(lines) > 100

            if truncated:
                preview = "\n".join(lines[:100]) + f"\n... ({len(lines) - 100} more lines)"
            else:
                preview = content

            return ToolResult(
                self.name,
                True,
                preview,
                metadata={"lines": len(lines), "truncated": truncated},
            )

        except Exception as e:
            logger.error(f"Failed to read {path}: {e}")
            return ToolResult(self.name, False, "", error=str(e))


class ListFilesTool(BaseTool):
    """List files matching pattern"""

    @property
    def name(self) -> str:
        return "list_files"

    @property
    def description(self) -> str:
        return "List files matching pattern. Args: pattern (str, glob pattern)"

    async def execute(self, pattern: str) -> ToolResult:
        """List files matching pattern"""
        try:
            matches = list(self.project_root.glob(pattern))
            matches = [str(m.relative_to(self.project_root)) for m in matches][:50]

            if not matches:
                return ToolResult(self.name, True, f"No files matching: {pattern}")

            output = "\n".join(matches)
            return ToolResult(
                self.name,
                True,
                output,
                metadata={"count": len(matches)},
            )

        except Exception as e:
            logger.error(f"Failed to list files: {e}")
            return ToolResult(self.name, False, "", error=str(e))


class SearchCodebaseTool(BaseTool):
    """Search for patterns in codebase"""

    @property
    def name(self) -> str:
        return "search_codebase"

    @property
    def description(self) -> str:
        return "Search for patterns in code. Args: query (str, regex pattern)"

    async def execute(self, query: str) -> ToolResult:
        """Search codebase for pattern"""
        try:
            results = []
            pattern = re.compile(query, re.IGNORECASE)

            for py_file in self.project_root.rglob("*.py"):
                try:
                    content = py_file.read_text(encoding="utf-8", errors="ignore")
                    if pattern.search(content):
                        results.append(str(py_file.relative_to(self.project_root)))
                except Exception:
                    pass

            for ts_file in self.project_root.rglob("*.ts"):
                try:
                    content = ts_file.read_text(encoding="utf-8", errors="ignore")
                    if pattern.search(content):
                        results.append(str(ts_file.relative_to(self.project_root)))
                except Exception:
                    pass

            if not results:
                return ToolResult(self.name, True, f"No matches for: {query}")

            output = "\n".join(results[:20])
            return ToolResult(
                self.name,
                True,
                output,
                metadata={"matches": len(results)},
            )

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return ToolResult(self.name, False, "", error=str(e))


class InspectConfigTool(BaseTool):
    """Inspect project configuration files"""

    @property
    def name(self) -> str:
        return "inspect_config"

    @property
    def description(self) -> str:
        return "Inspect project configuration files (package.json, etc)"

    async def execute(self) -> ToolResult:
        """Inspect configuration"""
        try:
            output = []

            pkg_json = self.project_root / "package.json"
            if pkg_json.exists():
                try:
                    import json

                    data = json.loads(pkg_json.read_text())
                    output.append("package.json:")
                    output.append(f"  name: {data.get('name')}")
                    output.append(f"  scripts: {list(data.get('scripts', {}).keys())}")
                    output.append(f"  deps: {len(data.get('dependencies', {}))}")
                except Exception as e:
                    output.append(f"package.json: error reading ({e})")

            pyproject = self.project_root / "pyproject.toml"
            if pyproject.exists():
                try:
                    import tomllib

                    with open(pyproject, "rb") as f:
                        data = tomllib.load(f)
                    output.append("pyproject.toml:")
                    output.append(f"  project: {data.get('project', {}).get('name')}")
                except Exception as e:
                    output.append(f"pyproject.toml: error reading ({e})")

            return ToolResult(
                self.name,
                True,
                "\n".join(output) if output else "No config files found",
            )

        except Exception as e:
            logger.error(f"Config inspection failed: {e}")
            return ToolResult(self.name, False, "", error=str(e))


class GitStatusTool(BaseTool):
    """Get detailed git status"""

    @property
    def name(self) -> str:
        return "git_status"

    @property
    def description(self) -> str:
        return "Get detailed git status"

    async def execute(self) -> ToolResult:
        """Get git status"""
        try:
            # Branch
            branch_result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"

            # Status
            status_result = subprocess.run(
                ["git", "status", "--short"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            status = status_result.stdout.strip() if status_result.returncode == 0 else "unknown"

            # Recent commits
            log_result = subprocess.run(
                ["git", "log", "--oneline", "-5"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            logs = log_result.stdout.strip() if log_result.returncode == 0 else "none"

            output = f"Branch: {branch}\n\nChanges:\n{status}\n\nRecent commits:\n{logs}"
            return ToolResult(self.name, True, output)

        except Exception as e:
            logger.error(f"Git status failed: {e}")
            return ToolResult(self.name, False, "", error=str(e))


class RunTestsTool(BaseTool):
    """Run project tests"""

    @property
    def name(self) -> str:
        return "run_tests"

    @property
    def description(self) -> str:
        return "Run project tests"

    async def execute(self) -> ToolResult:
        """Run tests"""
        try:
            # Try npm test first
            test_result = subprocess.run(
                ["npm", "test", "--", "--maxWorkers=1"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=60,
            )

            if test_result.returncode == 0:
                return ToolResult(
                    self.name,
                    True,
                    "All tests passed",
                    metadata={"passed": True},
                )
            else:
                return ToolResult(
                    self.name,
                    False,
                    test_result.stdout,
                    error=test_result.stderr,
                )

        except subprocess.TimeoutExpired:
            return ToolResult(
                self.name,
                False,
                "",
                error="Tests timed out after 60s",
            )
        except Exception as e:
            logger.error(f"Test execution failed: {e}")
            return ToolResult(self.name, False, "", error=str(e))


class BrowserValidateTool(BaseTool):
    """Validate UI/browser interactions"""

    @property
    def name(self) -> str:
        return "browser_validate"

    @property
    def description(self) -> str:
        return "Validate UI/browser interactions"

    async def execute(self) -> ToolResult:
        """Validate browser interactions"""
        # This is a placeholder - would integrate with actual browser workflow
        return ToolResult(
            self.name,
            True,
            "Browser validation ready (requires explicit trigger)",
        )


class CreatePlanTool(BaseTool):
    """Create execution plan"""

    @property
    def name(self) -> str:
        return "create_plan"

    @property
    def description(self) -> str:
        return "Create execution plan for fixes"

    async def execute(self, task: str = "") -> ToolResult:
        """Create plan"""
        # This would integrate with PlanningEngine
        return ToolResult(
            self.name,
            True,
            f"Plan creation ready for: {task}",
        )


class GeneratePatchTool(BaseTool):
    """Generate patch for fixes"""

    @property
    def name(self) -> str:
        return "generate_patch"

    @property
    def description(self) -> str:
        return "Generate patch for fixes"

    async def execute(self) -> ToolResult:
        """Generate patch"""
        # This would integrate with PatchEngine
        return ToolResult(
            self.name,
            True,
            "Patch generation ready",
        )


class ExecuteCommandTool(BaseTool):
    """Execute shell commands"""

    @property
    def name(self) -> str:
        return "execute_command"

    @property
    def description(self) -> str:
        return "Execute shell commands. Args: command (str)"

    async def execute(self, command: str) -> ToolResult:
        """Execute command"""
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0:
                return ToolResult(
                    self.name,
                    True,
                    result.stdout,
                )
            else:
                return ToolResult(
                    self.name,
                    False,
                    result.stdout,
                    error=result.stderr,
                )

        except subprocess.TimeoutExpired:
            return ToolResult(
                self.name,
                False,
                "",
                error="Command timed out after 30s",
            )
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            return ToolResult(self.name, False, "", error=str(e))


class ToolRegistry:
    """Registry of available tools"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.tools = {
            "read_file": ReadFileTool(project_root),
            "list_files": ListFilesTool(project_root),
            "search_codebase": SearchCodebaseTool(project_root),
            "inspect_config": InspectConfigTool(project_root),
            "git_status": GitStatusTool(project_root),
            "run_tests": RunTestsTool(project_root),
            "browser_validate": BrowserValidateTool(project_root),
            "create_plan": CreatePlanTool(project_root),
            "generate_patch": GeneratePatchTool(project_root),
            "execute_command": ExecuteCommandTool(project_root),
        }

    async def execute_tool(self, tool_name: str, **kwargs) -> ToolResult:
        """Execute a tool by name"""
        if tool_name not in self.tools:
            return ToolResult(
                tool_name,
                False,
                "",
                error=f"Unknown tool: {tool_name}",
            )

        tool = self.tools[tool_name]
        logger.info(f"● Executing {tool_name}")

        try:
            result = await tool.execute(**kwargs)
            logger.info(f"  ✓ {tool_name} complete")
            return result
        except Exception as e:
            logger.error(f"  ✗ {tool_name} failed: {e}")
            return ToolResult(tool_name, False, "", error=str(e))

    async def execute_tools(self, tool_requests: List[Dict[str, Any]]) -> List[ToolResult]:
        """Execute multiple tools"""
        results = []
        for request in tool_requests:
            tool_name = request.get("name")
            kwargs = request.get("args", {})
            result = await self.execute_tool(tool_name, **kwargs)
            results.append(result)
        return results

    def get_tool_descriptions(self) -> str:
        """Get descriptions of all tools"""
        descriptions = []
        for tool_name, tool in self.tools.items():
            descriptions.append(f"- {tool_name}: {tool.description}")
        return "\n".join(descriptions)
