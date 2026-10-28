"""
Acceptance tests for DeV model-driven agent core.
"""

import tempfile
from pathlib import Path

from app.cli.agent_core import AgentCore, AgentDecision, AgentDecisionEngine


class TestAgentCoreAcceptance:
    def test_hi_returns_agent_response(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            core.decision_engine._decide_with_model = lambda *_args, **_kwargs: AgentDecision(  # type: ignore[attr-defined]
                intent="greeting",
                requires_tools=False,
                tools=[],
                response_strategy="reply_directly",
                needs_approval=False,
                risk_level="low",
            )
            outcome = core.process("hi")
            assert outcome.action == "respond"
            assert "ready" in outcome.message.lower()

    def test_tech_stack_runs_repo_inspection(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "pyproject.toml").write_text(
                """
[project]
name = "demo"
dependencies = ["fastapi>=0.1", "redis>=5"]
                """.strip(),
                encoding="utf-8",
            )
            core = AgentCore(root, provider_router=None, health_manager=None)
            core.decision_engine._decide_with_model = lambda *_args, **_kwargs: AgentDecision(  # type: ignore[attr-defined]
                intent="project_analysis",
                requires_tools=True,
                tools=["inspect_pyproject", "inspect_folder_structure"],
                response_strategy="analyze_then_reply",
                needs_approval=False,
                risk_level="low",
            )
            outcome = core.process("what is my tech stack?")
            assert outcome.action == "respond"
            assert "tech stack" in outcome.message.lower()
            assert "fastapi" in outcome.message.lower()

    def test_auth_flow_analysis_uses_auth_discovery(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            auth_dir = root / "app" / "auth"
            auth_dir.mkdir(parents=True)
            (auth_dir / "login.py").write_text("def login(): pass", encoding="utf-8")
            core = AgentCore(root, provider_router=None, health_manager=None)
            core.decision_engine._decide_with_model = lambda *_args, **_kwargs: AgentDecision(  # type: ignore[attr-defined]
                intent="code_understanding",
                requires_tools=True,
                tools=["discover_auth_files"],
                response_strategy="analyze_then_reply",
                needs_approval=False,
                risk_level="low",
            )
            outcome = core.process("explain auth flow")
            assert outcome.action == "respond"
            assert "auth" in outcome.message.lower()
            assert "login.py" in outcome.message

    def test_fix_build_routes_to_execution(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            core.decision_engine._decide_with_model = lambda *_args, **_kwargs: AgentDecision(  # type: ignore[attr-defined]
                intent="execution_task",
                requires_tools=False,
                tools=[],
                response_strategy="approval_then_execute",
                needs_approval=True,
                risk_level="medium",
            )
            outcome = core.process("fix production build failure")
            assert outcome.action == "execute_task"
            assert outcome.task == "fix production build failure"

    def test_provider_failure_falls_back_to_lightweight(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            outcome = core.process("fix login bug")
            assert outcome.action == "execute_task"

    def test_unclear_task_asks_clarification(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            outcome = core.process("fix auth")
            assert outcome.action == "respond"
            assert "inspect" in outcome.message.lower() or "clarify" in outcome.message.lower()

    def test_command_intent_routes_to_command_action(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            outcome = core.process("/model")
            assert outcome.action == "command"


class TestAgentDecisionEngine:
    def test_fallback_decision_for_help(self):
        engine = AgentDecisionEngine(provider_router=None, health_manager=None)
        decision = engine.decide("what can you do")
        assert decision.intent == "help"
        assert decision.needs_approval is False
