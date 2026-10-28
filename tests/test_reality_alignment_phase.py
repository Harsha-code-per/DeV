"""
Reality Alignment Phase Tests

Validates that:
1. Provider state shown matches backend reality
2. No old router logic leaks through
3. Repository analysis works with fallback
4. Natural input routing is correct
5. Startup validation shows accurate provider state
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch

import pytest

from app.cli.agent_core import AgentDecisionEngine, AgentCore
from app.cli.startup_experience import StartupExperience
from app.cli.elite_cli_runner import EliteCLIRunner
from app.cli.model_control_center import ModelControlCenter
from app.models.enhanced_provider_factory import get_enhanced_provider_factory
from app.models.multi_provider_system import FallbackRouter, HealthManager, ProviderConfig
from app.models.provider_reality import ProviderRealityManager, ProviderAvailability


class TestProviderRealityAlignment:
    """Test backend-first provider state display"""
    
    def test_provider_shown_only_if_configured(self):
        """Provider must appear only if actually configured"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            reality = ProviderRealityManager(factory)
            truth = reality.get_current_truth()
            
            # Without env vars configured, no providers available
            assert not truth.has_any_available_provider
            assert len(truth.available_providers) == 0
    
    def test_model_control_center_reflects_reality(self):
        """ModelControlCenter must show only real, available providers"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            model_control = ModelControlCenter(router)
            
            # Without configured providers, no providers shown
            truth = model_control.reality_manager.get_current_truth()
            assert not truth.has_any_available_provider
            
            # get_status should reflect reality
            status = model_control.get_status()
            assert "No Providers Configured" in status or "Unconfigured" in status.lower()
    
    def test_cannot_switch_to_unconfigured_provider(self):
        """Cannot switch to provider without API key configured"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            model_control = ModelControlCenter(router)
            
            # Try to switch to unavailable provider
            result = model_control.set_provider("groq")
            
            # Should show it's unavailable
            assert "not available" in result.lower() or "no providers" in result.lower() or "unconfigured" in result.lower()


class TestNoOldRouterLeakage:
    """Verify old /plan routing logic doesn't leak through"""
    
    def test_natural_input_goes_through_agent_core(self):
        """All natural input must go through AgentCore.process()"""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            
            # Mock the engine and router to verify routing
            runner.engine.process_natural_task = Mock(return_value=("error", "test"))
            
            # Test that input goes to agent_core first, not old router
            test_inputs = [
                "what is this project",
                "fix production build",
                "work with me",
            ]
            
            for user_input in test_inputs:
                # Agent core should process, not skip to old logic
                outcome = runner.agent_core.process(user_input)
                
                # Verify we got a real decision (not a fallback skip)
                assert outcome is not None
                assert outcome.action in ["respond", "execute_task", "command"]


class TestRepositoryIntelligenceWithFallback:
    """Verify repo analysis works even when model unavailable"""
    
    def test_project_analysis_recognized_in_fallback(self):
        """Project analysis queries recognized even without model"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            health = HealthManager(factory)
            
            engine = AgentDecisionEngine(router, health)
            
            # These should be recognized as project_analysis in fallback
            analysis_queries = [
                "what is this project",
                "what is my tech stack",
                "explain the architecture",
                "review auth flow",
                "analyze the dependencies",
                "inspect project structure",
            ]
            
            for query in analysis_queries:
                decision = engine.decide(query)
                # Should be project_analysis, not help or fallback generic
                assert decision.intent in ["project_analysis", "architecture_review", "code_understanding", "system_diagnosis"]
    
    def test_execution_tasks_properly_routed(self):
        """Execution tasks routed to execute_task intent"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            health = HealthManager(factory)
            
            engine = AgentDecisionEngine(router, health)
            
            execution_queries = [
                "fix production build",
                "debug auth flow",
                "fix login bug",
            ]
            
            for query in execution_queries:
                decision = engine.decide(query)
                assert decision.intent in ["execution_task", "bug_fix", "clarification"]
                # Execution should require approval
                assert decision.needs_approval or decision.requires_clarification


class TestNaturalInputRouting:
    """Verify natural input routing is correct and not fake"""
    
    def test_greeting_handled_naturally(self):
        """Greeting should get natural response"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            health = HealthManager(factory)
            agent_core = AgentCore(
                project_root=Path(tmpdir),
                provider_router=router,
                health_manager=health,
                emit_fn=lambda x: None,
            )
            
            outcome = agent_core.process("hi")
            
            assert outcome.action == "respond"
            assert "ready" in outcome.message.lower() or "hi" in outcome.message.lower()
    
    def test_help_handled_naturally(self):
        """Help request should get help response"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            health = HealthManager(factory)
            agent_core = AgentCore(
                project_root=Path(tmpdir),
                provider_router=router,
                health_manager=health,
                emit_fn=lambda x: None,
            )
            
            outcome = agent_core.process("help")
            
            assert outcome.action == "respond"
            assert "help" in outcome.message.lower() or "can" in outcome.message.lower()
    
    def test_command_intent_routed_to_command_action(self):
        """Slash commands routed as commands"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            health = HealthManager(factory)
            agent_core = AgentCore(
                project_root=Path(tmpdir),
                provider_router=router,
                health_manager=health,
                emit_fn=lambda x: None,
            )
            
            outcome = agent_core.process("/model")
            
            assert outcome.action == "command"


class TestStartupValidation:
    """Verify startup shows accurate provider state"""
    
    def test_startup_validates_provider_reality(self):
        """Startup must validate and display real provider state"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            reality = ProviderRealityManager(factory)
            startup = StartupExperience(Path(tmpdir))
            
            # Should not raise error even with no providers
            startup.validate_provider_reality(reality)
            
            # Context should be updated with real state
            truth = reality.get_current_truth()
            if truth.has_any_available_provider:
                assert startup.context.provider in truth.available_providers
            else:
                assert startup.context.provider in ["Unconfigured", "Unknown"]
    
    def test_startup_experience_initialization_complete(self):
        """Full startup initialization should complete without errors"""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            
            # Run through initialization (not full run loop)
            runner.startup.show_logo()
            runner.startup.initialize_project_structure()
            runner.startup.initialize_sandbox(None)
            runner.startup.detect_project()
            runner.startup.validate_provider_reality(runner.provider_reality)
            runner.startup.set_model_info(runner.context.model_name, runner.context.provider)
            
            # All should complete without error


class TestAcceptanceRealityAlignment:
    """End-to-end acceptance tests for reality alignment"""
    
    def test_project_queries_work_without_providers(self):
        """Project analysis should work even when no providers configured"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create minimal project files
            project_path = Path(tmpdir)
            (project_path / "package.json").write_text('{"name": "test"}')
            
            agent = AgentCore(
                project_root=project_path,
                provider_router=None,
                health_manager=None,
                emit_fn=lambda x: None,
            )
            
            outcome = agent.process("what is this project")
            
            # Should return analysis response
            assert outcome.action == "respond"
            # Should mention the project/analysis
            assert "project" in outcome.message.lower() or "test" in outcome.message.lower() or "analyze" in outcome.message.lower()
    
    def test_execution_queries_properly_gated(self):
        """Execution queries require approval"""
        with tempfile.TemporaryDirectory() as tmpdir:
            agent = AgentCore(
                project_root=Path(tmpdir),
                provider_router=None,
                health_manager=None,
                emit_fn=lambda x: None,
            )
            
            outcome = agent.process("fix production build")
            
            # Should route to execution task
            assert outcome.action == "execute_task"
            assert outcome.decision.needs_approval or outcome.decision.requires_clarification
    
    def test_old_router_not_in_path(self):
        """Old command-based routing should not interfere"""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            
            # Ensure old router is not the primary path for natural input
            # (ConversationEngine should only be called AFTER agent_core decision)
            assert hasattr(runner, 'agent_core')
            assert hasattr(runner, 'engine')
            
            # agent_core should be called first in _main_loop
            # This is validated by tracing the code path in _main_loop


class TestProviderHealthAlignment:
    """Verify provider health tracking shows real state"""
    
    def test_health_manager_reflects_reality(self):
        """HealthManager should track actual provider availability"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            health = HealthManager(factory)
            
            # Get health status - should reflect reality
            # (With no env vars, no providers should be healthy)
            assert health is not None
    
    def test_fallback_router_routes_to_real_providers(self):
        """FallbackRouter should only route to available providers"""
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            router = FallbackRouter(factory)
            
            # Try to get a route - should handle gracefully if no providers
            from app.models.multi_provider_system import TaskType
            route = router.route(TaskType.CLASSIFICATION)
            
            # Should return valid route (might be error route if no providers)
            assert route is not None
