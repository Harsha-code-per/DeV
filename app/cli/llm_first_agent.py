"""
LLM-First Agent Core for DeV

The true brain of DeV. Every natural input goes to the model first.
Model decides:
- How to respond
- Which tools to use
- If clarification is needed
- If execution is required

No hardcoded templates. No if/else routing. Pure model reasoning.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
import tomllib

from app.models.multi_provider_system import (
    FallbackRouter,
    HealthManager,
    TaskType as ModelTaskType,
)
from app.utils.logger import get_logger

logger = get_logger(__name__)


class AgentAction(Enum):
    """Actions the agent can decide to take"""
    RESPOND = "respond"  # Generate a response
    CLARIFY = "clarify"  # Ask for clarification
    EXECUTE = "execute"  # Trigger execution workflow
    TOOL_USE = "tool_use"  # Use tools and then respond


@dataclass
class AgentDecision:
    """Structured decision from model reasoning"""
    action: AgentAction
    response: str
    tools_to_use: List[str] = field(default_factory=list)
    confidence: float = 0.9
    reasoning: str = ""
    requires_approval: bool = False


@dataclass
class TerminalContext:
    """Rich terminal context for the model"""
    cwd: str
    git_branch: str
    git_status: str
    project_structure: str
    tech_stack: Dict[str, Any]
    project_type: str
    has_package_json: bool
    has_pyproject_toml: bool
    has_dockerfile: bool
    recent_analysis: Optional[str] = None


class TerminalContextCollector:
    """Gathers rich terminal context automatically"""

    def __init__(self, project_root: Path):
        self.project_root = project_root

    def collect(self) -> TerminalContext:
        """Collect all terminal context"""
        cwd = str(Path.cwd())
        git_branch = self._get_git_branch()
        git_status = self._get_git_status()
        project_structure = self._get_project_structure()
        tech_stack = self._detect_tech_stack()
        project_type = self._detect_project_type(tech_stack)

        return TerminalContext(
            cwd=cwd,
            git_branch=git_branch,
            git_status=git_status,
            project_structure=project_structure,
            tech_stack=tech_stack,
            project_type=project_type,
            has_package_json=(self.project_root / "package.json").exists(),
            has_pyproject_toml=(self.project_root / "pyproject.toml").exists(),
            has_dockerfile=(self.project_root / "Dockerfile").exists(),
        )

    def _get_git_branch(self) -> str:
        """Get current git branch"""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.stdout.strip() if result.returncode == 0 else "unknown"
        except Exception as e:
            logger.debug(f"Failed to get git branch: {e}")
            return "unknown"

    def _get_git_status(self) -> str:
        """Get git status summary"""
        try:
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                return f"{len(lines)} files changed" if lines else "clean"
            return "unknown"
        except Exception as e:
            logger.debug(f"Failed to get git status: {e}")
            return "unknown"

    def _get_project_structure(self) -> str:
        """Get project directory structure (first 2 levels)"""
        try:
            items = []
            for item in sorted(self.project_root.iterdir())[:10]:
                if item.name.startswith("."):
                    continue
                indent = "  "
                if item.is_dir():
                    items.append(f"{indent}📁 {item.name}/")
                else:
                    items.append(f"{indent}📄 {item.name}")
            return "\n".join(items) or "empty"
        except Exception as e:
            logger.debug(f"Failed to get project structure: {e}")
            return "unknown"

    def _detect_tech_stack(self) -> Dict[str, Any]:
        """Detect project technology stack"""
        stack: Dict[str, Any] = {
            "languages": [],
            "frameworks": [],
            "databases": [],
            "tools": [],
        }

        # Check package.json
        pkg_json = self.project_root / "package.json"
        if pkg_json.exists():
            try:
                data = json.loads(pkg_json.read_text(encoding="utf-8"))
                deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}

                if "react" in deps:
                    stack["frameworks"].append("React")
                if "next" in deps:
                    stack["frameworks"].append("Next.js")
                if "express" in deps:
                    stack["frameworks"].append("Express")
                if "vue" in deps:
                    stack["frameworks"].append("Vue")
                if "typescript" in deps:
                    stack["languages"].append("TypeScript")
                if "jest" in deps or "vitest" in deps:
                    stack["tools"].append("Testing")
                if "postgresql" in str(deps) or "pg" in deps:
                    stack["databases"].append("PostgreSQL")
                if "mongodb" in str(deps):
                    stack["databases"].append("MongoDB")
                if "redis" in deps:
                    stack["tools"].append("Redis")

                stack["languages"].append("JavaScript")
            except Exception as e:
                logger.debug(f"Failed to parse package.json: {e}")

        # Check pyproject.toml
        pyproject = self.project_root / "pyproject.toml"
        if pyproject.exists():
            try:
                with open(pyproject, "rb") as f:
                    data = tomllib.load(f)
                    deps = data.get("project", {}).get("dependencies", [])

                    if any("django" in str(dep) for dep in deps):
                        stack["frameworks"].append("Django")
                    if any("fastapi" in str(dep) for dep in deps):
                        stack["frameworks"].append("FastAPI")
                    if any("flask" in str(dep) for dep in deps):
                        stack["frameworks"].append("Flask")
                    if any("pytest" in str(dep) for dep in deps):
                        stack["tools"].append("pytest")

                    stack["languages"].append("Python")
            except Exception as e:
                logger.debug(f"Failed to parse pyproject.toml: {e}")

        # Check for Docker
        if (self.project_root / "Dockerfile").exists():
            stack["tools"].append("Docker")

        # Check for auth
        if self._has_auth_files():
            stack["tools"].append("Authentication")

        return stack

    def _has_auth_files(self) -> bool:
        """Check if project has auth-related files"""
        auth_patterns = ["auth", "jwt", "session", "login", "oauth"]
        try:
            for item in self.project_root.rglob("*.py"):
                content = item.read_text(encoding="utf-8", errors="ignore")
                if any(pattern in content.lower() for pattern in auth_patterns):
                    return True
            for item in self.project_root.rglob("*.ts"):
                content = item.read_text(encoding="utf-8", errors="ignore")
                if any(pattern in content.lower() for pattern in auth_patterns):
                    return True
        except Exception as e:
            logger.debug(f"Failed to check auth files: {e}")
        return False

    def _detect_project_type(self, tech_stack: Dict[str, Any]) -> str:
        """Detect project type based on tech stack"""
        frameworks = tech_stack.get("frameworks", [])
        languages = tech_stack.get("languages", [])

        if "Next.js" in frameworks or "React" in frameworks:
            return "Frontend"
        if "Django" in frameworks or "FastAPI" in frameworks or "Flask" in frameworks:
            return "Backend"
        if "Python" in languages and not frameworks:
            return "Python Project"
        if "JavaScript" in languages and not frameworks:
            return "JavaScript Project"

        return "Unknown"


class LLMPromptBuilder:
    """Builds rich LLM prompts with terminal context"""

    def __init__(self, context: TerminalContext):
        self.context = context

    def build_system_prompt(self) -> str:
        """Build system prompt for the model"""
        return """You are DeV, an elite terminal-native AI engineering agent.

Your role:
- Analyze user requests from an engineering perspective
- Use available tools to understand the project
- Make intelligent, context-aware decisions
- Always be transparent about what you're doing

Guidelines:
- Be direct and professional
- Show your reasoning when it matters
- Use tools strategically (don't use them if not needed)
- Ask clarifying questions if ambiguous
- Never make assumptions without verification

Available actions:
- respond: Direct response to user
- clarify: Ask intelligent clarifying questions
- execute: Trigger execution workflow for fixes
- tool_use: Use tools to analyze project then respond

Remember: You are the brain. You decide what happens next."""

    def build_user_prompt(self, user_message: str) -> str:
        """Build user prompt with context"""
        context_str = self._format_context()

        return f"""TERMINAL CONTEXT:
{context_str}

USER REQUEST:
{user_message}

What should you do? Respond with a JSON object:
{{
  "action": "respond" | "clarify" | "execute" | "tool_use",
  "response": "Your response to the user",
  "tools_to_use": [],  // if tool_use, list tools
  "reasoning": "Why you chose this action",
  "requires_approval": false  // if execute, does it need approval?
}}"""

    def _format_context(self) -> str:
        """Format context for readability"""
        tech_str = self._format_tech_stack()

        return f"""Current Directory: {self.context.cwd}
Git Branch: {self.context.git_branch}
Git Status: {self.context.git_status}
Project Type: {self.context.project_type}

Project Structure:
{self.context.project_structure}

Tech Stack:
{tech_str}

Available Tools:
- read_file(path): Read a file's contents
- list_files(pattern): List files matching pattern
- search_codebase(query): Search for patterns in code
- inspect_config(): Inspect configuration files
- git_status(): Get detailed git status
- run_tests(): Run project tests
- browser_validate(): Validate UI/browser interactions
- create_plan(): Generate execution plan
- generate_patch(): Generate a fix patch
- execute_command(): Run shell commands"""

    def _format_tech_stack(self) -> str:
        """Format tech stack for display"""
        stack = self.context.tech_stack
        lines = []

        if stack.get("languages"):
            lines.append(f"Languages: {', '.join(stack['languages'])}")
        if stack.get("frameworks"):
            lines.append(f"Frameworks: {', '.join(stack['frameworks'])}")
        if stack.get("databases"):
            lines.append(f"Databases: {', '.join(stack['databases'])}")
        if stack.get("tools"):
            lines.append(f"Tools: {', '.join(stack['tools'])}")

        return "\n".join(lines) if lines else "Standard setup"


class LLMFirstAgentCore:
    """Main LLM-first agent orchestrator"""

    def __init__(
        self,
        project_root: Path,
        provider_router: FallbackRouter,
        health_manager: HealthManager,
    ):
        self.project_root = project_root
        self.provider_router = provider_router
        self.health_manager = health_manager
        self.context_collector = TerminalContextCollector(project_root)

    async def process(self, user_message: str) -> AgentDecision:
        """
        Process natural user input through LLM reasoning.

        Args:
            user_message: Natural language user input

        Returns:
            Structured decision from model
        """
        logger.info(f"Processing: {user_message[:50]}...")

        # Gather terminal context
        context = self.context_collector.collect()
        logger.debug(f"Context: {context.project_type} @ {context.cwd}")

        # Build prompts
        prompt_builder = LLMPromptBuilder(context)
        system_prompt = prompt_builder.build_system_prompt()
        user_prompt = prompt_builder.build_user_prompt(user_message)

        # Call model
        decision_text = await self._call_model(system_prompt, user_prompt)
        logger.debug(f"Model response: {decision_text[:100]}...")

        # Parse decision
        decision = self._parse_decision(decision_text)
        logger.info(f"Decision: {decision.action.value}")

        return decision

    async def _call_model(self, system_prompt: str, user_prompt: str) -> str:
        """Call the model to get decision"""
        try:
            # Use provider router to get best provider
            provider = self.provider_router.get_provider()
            if not provider:
                logger.error("No provider available")
                return self._default_response()

            # Log which provider we're using
            logger.info(f"● Using {provider.config.name} for agent decision")

            # Call model
            model_name = provider.config.models[0] if provider.config.models else "default"
            response = await provider.generate(
                prompt=user_prompt,
                model=model_name,
                temperature=0.7,
                max_tokens=1024,
            )

            return response

        except Exception as e:
            logger.error(f"Model call failed: {e}")
            return self._default_response()

    def _parse_decision(self, response_text: str) -> AgentDecision:
        """Parse model response into structured decision"""
        try:
            # Try to extract JSON from response
            start = response_text.find("{")
            end = response_text.rfind("}") + 1

            if start >= 0 and end > start:
                json_str = response_text[start:end]
                data = json.loads(json_str)

                action_str = data.get("action", "respond")
                action = AgentAction[action_str.upper()] if action_str in [
                    "respond",
                    "clarify",
                    "execute",
                    "tool_use",
                ] else AgentAction.RESPOND

                return AgentDecision(
                    action=action,
                    response=data.get("response", response_text),
                    tools_to_use=data.get("tools_to_use", []),
                    reasoning=data.get("reasoning", ""),
                    requires_approval=data.get("requires_approval", False),
                )

        except Exception as e:
            logger.warning(f"Failed to parse decision: {e}")

        # Fallback: treat as simple response
        return AgentDecision(
            action=AgentAction.RESPOND,
            response=response_text,
        )

    def _default_response(self) -> str:
        """Default response when model unavailable"""
        return json.dumps({
            "action": "respond",
            "response": "I encountered a technical issue. Please try again.",
            "reasoning": "Model provider unavailable",
        })
