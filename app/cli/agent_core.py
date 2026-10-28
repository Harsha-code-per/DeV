"""
Model-driven agent core for DeV.

All natural user input is evaluated by the model-first decision loop.
"""

from __future__ import annotations

import asyncio
import json
import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.cli.intent_detector import Intent, IntentDetector
from app.cli.tool_visibility import (
    ReasoningExplanation,
    ToolVisibilityLayer,
    VisibleRepositoryIntelligence,
)
from app.models.multi_provider_system import (
    FallbackRouter,
    HealthManager,
    TaskType as ModelTaskType,
)
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class AgentDecision:
    """Structured decision returned by model reasoning."""

    intent: str
    requires_tools: bool
    tools: List[str]
    response_strategy: str
    needs_approval: bool
    risk_level: str
    requires_clarification: bool = False
    clarification_question: Optional[str] = None


@dataclass
class AgentOutcome:
    """Final actionable outcome for CLI loop."""

    action: str  # respond | execute_task | command
    message: str
    task: Optional[str] = None
    decision: Optional[AgentDecision] = None
    tool_outputs: Dict[str, Any] = field(default_factory=dict)


class RepositoryIntelligence:
    """Read-only project analysis toolchain."""

    def __init__(self, project_root: Path):
        self.project_root = project_root

    def inspect_package_json(self) -> Dict[str, Any]:
        file_path = self.project_root / "package.json"
        if not file_path.exists():
            return {}
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            deps = data.get("dependencies", {})
            dev_deps = data.get("devDependencies", {})
            scripts = data.get("scripts", {})
            return {
                "name": data.get("name"),
                "deps": list(deps.keys()),
                "dev_deps": list(dev_deps.keys()),
                "scripts": list(scripts.keys()),
            }
        except Exception as exc:
            logger.warning(f"package.json parse failed: {exc}")
            return {}

    def inspect_pyproject(self) -> Dict[str, Any]:
        file_path = self.project_root / "pyproject.toml"
        if not file_path.exists():
            return {}
        try:
            data = tomllib.loads(file_path.read_text(encoding="utf-8"))
            project = data.get("project", {})
            return {
                "name": project.get("name"),
                "python": project.get("requires-python"),
                "dependencies": project.get("dependencies", []),
                "scripts": list(project.get("scripts", {}).keys()),
            }
        except Exception as exc:
            logger.warning(f"pyproject.toml parse failed: {exc}")
            return {}

    def inspect_requirements(self) -> List[str]:
        file_path = self.project_root / "requirements.txt"
        if not file_path.exists():
            return []
        try:
            return [
                line.strip()
                for line in file_path.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.startswith("#")
            ]
        except Exception as exc:
            logger.warning(f"requirements.txt parse failed: {exc}")
            return []

    def inspect_folder_structure(self) -> List[str]:
        skip = {".git", ".dev", "__pycache__", "node_modules", ".venv", "venv"}
        names: List[str] = []
        for path in sorted(self.project_root.iterdir(), key=lambda p: p.name):
            if path.name in skip:
                continue
            names.append(path.name + ("/" if path.is_dir() else ""))
        return names[:40]

    def detect_frameworks(self, package_data: Dict[str, Any], pyproject_data: Dict[str, Any]) -> List[str]:
        frameworks: List[str] = []
        deps = {dep.lower() for dep in package_data.get("deps", []) + package_data.get("dev_deps", [])}
        py_deps = " ".join(pyproject_data.get("dependencies", [])).lower()
        all_tokens = " ".join(sorted(deps)) + " " + py_deps

        checks = [
            ("next.js", ["next"]),
            ("react", ["react"]),
            ("typescript", ["typescript"]),
            ("fastapi", ["fastapi"]),
            ("django", ["django"]),
            ("flask", ["flask"]),
            ("postgresql", ["postgres", "psycopg"]),
            ("redis", ["redis"]),
            ("jwt auth", ["jwt", "python-jose"]),
            ("playwright", ["playwright"]),
            ("websockets", ["socket.io", "websocket"]),
        ]
        for label, hints in checks:
            if any(hint in all_tokens for hint in hints):
                frameworks.append(label)
        return frameworks

    def discover_auth_files(self) -> List[str]:
        hits: List[str] = []
        pattern = re.compile(r"(auth|login|jwt|session|token)", re.IGNORECASE)
        for path in self.project_root.rglob("*"):
            if not path.is_file():
                continue
            rel = str(path.relative_to(self.project_root))
            if rel.startswith((".git/", ".dev/", "node_modules/", ".venv/", "venv/")):
                continue
            if pattern.search(rel):
                hits.append(rel)
            if len(hits) >= 25:
                break
        return hits

    def detect_deploy_configs(self) -> List[str]:
        candidates = [
            "Dockerfile",
            "docker-compose.yml",
            "docker-compose.yaml",
            ".github/workflows",
            "vercel.json",
            "netlify.toml",
            "Procfile",
        ]
        found: List[str] = []
        for candidate in candidates:
            if (self.project_root / candidate).exists():
                found.append(candidate)
        return found


class AgentDecisionEngine:
    """Model-first decision engine with lightweight fallback."""

    def __init__(
        self,
        provider_router: Optional[FallbackRouter],
        health_manager: Optional[HealthManager],
        lightweight_intent_detector: Optional[IntentDetector] = None,
    ):
        self.provider_router = provider_router
        self.health_manager = health_manager
        self.lightweight_intent_detector = lightweight_intent_detector or IntentDetector()

    def decide(self, user_input: str, context_hint: str = "") -> AgentDecision:
        """Return structured decision for the current user message."""
        model_decision = self._decide_with_model(user_input, context_hint=context_hint)
        if model_decision:
            return model_decision
        return self._fallback_decision(user_input)

    def _decide_with_model(self, user_input: str, context_hint: str = "") -> Optional[AgentDecision]:
        if not self.provider_router or not self.health_manager:
            return None

        route = self.provider_router.route(ModelTaskType.CLASSIFICATION)
        if route.provider_id == "error":
            return None

        schema = {
            "intent": "greeting|help|clarification|project_analysis|code_understanding|system_diagnosis|execution_task|architecture_review|bug_fix|browser_debugging|implementation_plan|command",
            "requires_tools": True,
            "tools": ["inspect_package_json", "inspect_pyproject", "inspect_folder_structure"],
            "response_strategy": "reply_directly|analyze_then_reply|ask_clarification|approval_then_execute",
            "needs_approval": False,
            "risk_level": "low|medium|high",
            "requires_clarification": False,
            "clarification_question": "",
        }
        prompt = (
            "You are the DeV agent decision core. "
            "Return ONLY valid JSON matching this schema:\n"
            f"{json.dumps(schema, indent=2)}\n\n"
            "Rules:\n"
            "- Prefer execution_task/bug_fix for actionable engineering requests.\n"
            "- Use project_analysis/code_understanding for repo questions.\n"
            "- use ask_clarification when request is ambiguous.\n"
            "- Include tools only from: inspect_package_json, inspect_pyproject, inspect_requirements, inspect_folder_structure, discover_auth_files, detect_deploy_configs.\n"
            "- Read-only analysis intents should set needs_approval=false.\n"
            "- Write/execution intents should set needs_approval=true.\n\n"
            f"Context hint: {context_hint or 'none'}\n"
            f"User input: {user_input}"
        )
        try:
            success, raw = asyncio.run(
                self.health_manager.execute_with_fallback(
                    route=route,
                    prompt=prompt,
                    temperature=0.1,
                    max_tokens=600,
                )
            )
            if not success:
                logger.warning(f"Model decision routing failed: {raw}")
                return None
            parsed = self._parse_json(raw)
            if not parsed:
                return None
            return AgentDecision(
                intent=str(parsed.get("intent", "clarification")),
                requires_tools=bool(parsed.get("requires_tools", False)),
                tools=[str(tool) for tool in parsed.get("tools", []) if isinstance(tool, str)],
                response_strategy=str(parsed.get("response_strategy", "reply_directly")),
                needs_approval=bool(parsed.get("needs_approval", False)),
                risk_level=str(parsed.get("risk_level", "low")),
                requires_clarification=bool(parsed.get("requires_clarification", False)),
                clarification_question=parsed.get("clarification_question") or None,
            )
        except Exception as exc:
            logger.warning(f"Model decision failed, using fallback: {exc}")
            return None

    def _parse_json(self, raw: str) -> Optional[Dict[str, Any]]:
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if "\n" in text:
                text = text.split("\n", 1)[1]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    return json.loads(text[start:end + 1])
                except json.JSONDecodeError:
                    return None
        return None

    def _fallback_decision(self, user_input: str) -> AgentDecision:
        """Fallback decision logic when model is unavailable."""
        import re
        lower_input = user_input.lower()
        
        # Check for common greetings (with word boundaries)
        greeting_keywords = {"hi", "hello", "hey", "greetings"}
        greeting_phrases = {"good morning", "good afternoon", "good evening"}
        
        if any(greeting_phrase in lower_input for greeting_phrase in greeting_phrases):
            return AgentDecision("greeting", False, [], "reply_directly", False, "low")
        
        # Check if it's a simple greeting (single/two words mostly)
        if len(user_input.split()) <= 2:
            if any(re.search(r'\b' + keyword + r'\b', lower_input) for keyword in greeting_keywords):
                return AgentDecision("greeting", False, [], "reply_directly", False, "low")
        
        # Check for help requests
        help_keywords = {"help", "what can you do", "capabilities", "what can i do"}
        if any(keyword in lower_input for keyword in help_keywords):
            return AgentDecision("help", False, [], "reply_directly", False, "low")
        
        # Check for project analysis queries (read-only operations that work without model)
        # These are read-only operations that work without model
        analysis_keywords = {
            "tech stack", "architecture", "project structure", "framework",
            "dependencies", "deployment", "build system",
            "what is this", "what are the", "explain the", "how does this",
            "review", "analyze", "understand", "inspect"
        }
        if any(keyword in lower_input for keyword in analysis_keywords):
            return AgentDecision(
                intent="project_analysis",
                requires_tools=True,
                tools=["inspect_package_json", "inspect_folder_structure"],
                response_strategy="analyze_then_reply",
                needs_approval=False,
                risk_level="low"
            )
        
        # Check for execution/fix/debug first (priority over analysis)
        execution_keywords = {"fix", "debug", "bug", "broken", "failing", "error"}
        if any(keyword in lower_input for keyword in execution_keywords):
            # Very short queries (2 words) about auth/bugs should ask for clarification
            # e.g. "fix auth", "debug login" but NOT "fix login bug" (3+ words)
            word_count = len(lower_input.split())
            if word_count == 2 and any(token in lower_input for token in ("auth", "login")):
                return AgentDecision(
                    "execution_task",
                    False,
                    [],
                    "ask_clarification",
                    True,
                    "medium",
                    requires_clarification=True,
                    clarification_question=(
                        "Do you want me to inspect login flow, JWT/session handling, "
                        "frontend auth state, or backend auth middleware first?"
                    ),
                )
            return AgentDecision("execution_task", False, [], "approval_then_execute", True, "medium")

        # Default to clarification when unsure
        return AgentDecision("clarification", False, [], "ask_clarification", False, "low", requires_clarification=True)


class AgentToolOrchestrator:
    """Execute model-selected read-only tools."""

    def __init__(self, intelligence: RepositoryIntelligence):
        self.intelligence = intelligence
        self.tool_map = {
            "inspect_package_json": self.intelligence.inspect_package_json,
            "inspect_pyproject": self.intelligence.inspect_pyproject,
            "inspect_requirements": self.intelligence.inspect_requirements,
            "inspect_folder_structure": self.intelligence.inspect_folder_structure,
            "discover_auth_files": self.intelligence.discover_auth_files,
            "detect_deploy_configs": self.intelligence.detect_deploy_configs,
        }

    def run(self, tools: List[str]) -> Dict[str, Any]:
        outputs: Dict[str, Any] = {}
        for tool in tools:
            fn = self.tool_map.get(tool)
            if not fn:
                continue
            try:
                outputs[tool] = fn()
            except Exception as exc:
                outputs[tool] = {"error": str(exc)}
        return outputs


class AgentCore:
    """Top-level model-driven agent orchestrator."""

    def __init__(
        self,
        project_root: Path,
        provider_router: Optional[FallbackRouter],
        health_manager: Optional[HealthManager],
        lightweight_intent_detector: Optional[IntentDetector] = None,
        emit_fn=None,
    ):
        self.project_root = project_root
        self.decision_engine = AgentDecisionEngine(
            provider_router=provider_router,
            health_manager=health_manager,
            lightweight_intent_detector=lightweight_intent_detector,
        )
        self.intelligence = RepositoryIntelligence(project_root)
        self.tools = AgentToolOrchestrator(self.intelligence)
        self.provider_router = provider_router
        self.health_manager = health_manager
        
        # Visibility layer
        self.emit_fn = emit_fn or print
        self.visibility = ToolVisibilityLayer(self.emit_fn)
        self.visible_intel = VisibleRepositoryIntelligence(self.intelligence, self.visibility)

    def process(self, user_input: str, context_hint: str = "") -> AgentOutcome:
        # Check for slash commands first (hard safety boundary)
        if user_input.strip().startswith("/"):
            return AgentOutcome(action="command", message="", decision=None)
        
        decision = self.decision_engine.decide(user_input, context_hint=context_hint)

        if decision.requires_clarification or decision.response_strategy == "ask_clarification":
            question = decision.clarification_question or (
                "Could you clarify the scope so I can execute safely?"
            )
            return AgentOutcome(action="respond", message=question, decision=decision)

        if decision.intent == "greeting":
            return AgentOutcome(
                action="respond",
                message="Hey — I’m ready.",
                decision=decision,
            )

        if decision.intent == "help":
            return AgentOutcome(
                action="respond",
                message=(
                    "I can help with bugs, build failures, repo analysis, architecture reviews, "
                    "and verification workflows. Tell me what you want to do."
                ),
                decision=decision,
            )

        analysis_intents = {
            "project_analysis",
            "code_understanding",
            "system_diagnosis",
            "architecture_review",
            "clarification",
        }
        if decision.intent in analysis_intents:
            # Show visible analysis steps
            self.emit_fn("")
            if decision.intent == "project_analysis":
                result = self._run_visible_tech_stack_analysis()
            elif decision.intent == "architecture_review":
                result = self._run_visible_structure_analysis()
            else:
                result = self._run_visible_auth_analysis()
            message = self._compose_analysis_response(user_input, decision.intent, result)
            return AgentOutcome(action="respond", message=message, decision=decision, tool_outputs=result)

        execution_intents = {
            "execution_task",
            "bug_fix",
            "browser_debugging",
            "implementation_plan",
        }
        if decision.intent in execution_intents:
            preface = (
                "I analyzed your request and I’m ready to execute with approval gates."
                if decision.needs_approval
                else "I analyzed your request and can proceed."
            )
            return AgentOutcome(
                action="execute_task",
                message=preface,
                task=user_input,
                decision=decision,
            )

        return AgentOutcome(
            action="respond",
            message="I’m ready. Tell me the engineering task you want me to run.",
            decision=decision,
        )

    def _default_tools_for_intent(self, intent: str) -> List[str]:
        if intent == "project_analysis":
            return [
                "inspect_package_json",
                "inspect_pyproject",
                "inspect_requirements",
                "inspect_folder_structure",
                "detect_deploy_configs",
            ]
        if intent == "code_understanding":
            return ["inspect_folder_structure", "discover_auth_files"]
        if intent == "architecture_review":
            return ["inspect_folder_structure", "detect_deploy_configs", "discover_auth_files"]
        return ["inspect_folder_structure"]

    def _compose_analysis_response(self, user_input: str, intent: str, outputs: Dict[str, Any]) -> str:
        framework_summary = self.intelligence.detect_frameworks(
            outputs.get("inspect_package_json", {}),
            outputs.get("inspect_pyproject", {}),
        )
        folders = outputs.get("inspect_folder_structure", [])
        auth_files = outputs.get("discover_auth_files", [])
        deploy = outputs.get("detect_deploy_configs", [])

        if intent == "project_analysis":
            lines = ["I inspected your repository and here’s what I found:", ""]
            if framework_summary:
                lines.append("Tech stack:")
                lines.extend(f"• {item}" for item in framework_summary)
            if folders:
                lines.append("\nTop-level structure:")
                lines.extend(f"• {item}" for item in folders[:10])
            if deploy:
                lines.append("\nDeployment/build signals:")
                lines.extend(f"• {item}" for item in deploy)
            if not framework_summary and not folders:
                lines.append("I need access to project files to summarize the stack confidently.")
            return "\n".join(lines)

        if "auth" in user_input.lower() or intent in {"code_understanding", "clarification"}:
            if auth_files:
                return (
                    "I inspected auth-related areas and these are likely part of your auth flow:\n"
                    + "\n".join(f"• {path}" for path in auth_files[:12])
                )
            return (
                "I inspected the repository but didn’t find clear auth-specific files yet. "
                "Point me to the backend/frontend auth entry points and I’ll map the full flow."
            )

        return "I inspected the repository and can dig deeper into any subsystem you choose."

    def _run_visible_tech_stack_analysis(self) -> Dict[str, Any]:
        """Run tech stack analysis with visible steps."""
        result = self.visible_intel.inspect_tech_stack()
        # Convert to expected format for _compose_analysis_response
        return {
            "inspect_package_json": result.get("package", {}),
            "inspect_pyproject": result.get("pyproject", {}),
            "inspect_folder_structure": result.get("folders", []),
            "detect_deploy_configs": result.get("deploy_configs", []),
        }

    def _run_visible_structure_analysis(self) -> Dict[str, Any]:
        """Run structure analysis with visible steps."""
        result = self.visible_intel.inspect_project_structure()
        # Convert to expected format for _compose_analysis_response
        return {
            "inspect_folder_structure": result.get("folders", []),
            "detect_deploy_configs": result.get("deploy_configs", []),
        }

    def _run_visible_auth_analysis(self) -> Dict[str, Any]:
        """Run auth analysis with visible steps."""
        result = self.visible_intel.inspect_auth_flow()
        # Convert to expected format for _compose_analysis_response
        return {
            "discover_auth_files": result.get("auth_files", []),
        }
