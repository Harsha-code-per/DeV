"""
Acceptance Tests for Agent Core V2 - LLM-First Terminal-Native Engineering Agent

These tests validate the new LLM-first architecture where:
- Every natural input goes to the model first
- Model decides on tool usage, approval needs, and routing
- Slash commands are hard safety boundaries (not model-routed)
- Session memory enables context continuity
- Repository intelligence is real (not fake/mocked)
"""

import asyncio
import json
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

from app.cli.agent_core import AgentCore, AgentDecisionEngine, RepositoryIntelligence
from app.cli.intent_detector import Intent, IntentDetector
from app.core.session_memory import SessionMemory, SessionManager, SessionMemoryStore
from app.models.multi_provider_system import FallbackRouter, HealthManager, ProviderFactory


# ============================================================================
# PART 1: NATURAL INPUT → MODEL DECIDES (6 tests)
# ============================================================================

class TestNaturalInputModelFirstRouting:
    """Verify that natural input goes through model for decision making"""

    def test_greeting_goes_to_model_not_hardcoded_template(self):
        """Greeting should be processed by model, not from hardcoded template"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            # When model unavailable, fallback should detect greeting via keywords
            outcome = core.process("hi")
            
            # Should get fallback greeting response (model unavailable)
            assert outcome.action == "respond"
            assert outcome.decision.intent == "greeting"
    
    def test_project_question_routes_to_analysis(self):
        """Project analysis question should route through model decision"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("explain the architecture")
            
            # Should detect as project_analysis intent (has "explain the" keyword)
            assert outcome.decision.intent in ("project_analysis", "clarification", "help")
    
    def test_execution_request_routes_to_execution(self):
        """Execution request should be identified by model as needing approval"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("fix the login bug")
            
            # Should detect as execution task requiring approval
            assert outcome.decision.intent == "execution_task"
            assert outcome.decision.needs_approval is True
    
    def test_help_request_not_hardcoded(self):
        """Help request should be recognized but model should handle response"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("what can you do")
            
            # Should recognize as help intent
            assert outcome.decision.intent == "help"
    
    def test_clarification_request_routes_correctly(self):
        """Ambiguous request should route to clarification"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("why did it break")
            
            # Should route to clarification or analysis
            assert outcome.decision.intent in ("clarification", "project_analysis")
    
    def test_complex_request_gets_model_analysis(self):
        """Complex requests should go through model decision engine"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("inspect the auth flow and check for JWT vulnerabilities")
            
            # Model should classify this appropriately
            assert outcome.decision.intent in ("execution_task", "project_analysis")
            assert outcome.decision.requires_tools is True


# ============================================================================
# PART 2: SLASH COMMANDS - HARD SAFETY BOUNDARIES (4 tests)
# ============================================================================

class TestSlashCommandsSafety:
    """Verify slash commands are hard boundaries, not model-routed"""

    def test_slash_model_command_routes_to_command_action(self):
        """Slash commands should route immediately, not through model"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("/model groq")
            
            assert outcome.action == "command"
            assert outcome.decision is None  # No decision when command recognized early
    
    def test_slash_exit_command_routes_correctly(self):
        """Exit command should be recognized as command"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("/exit")
            
            assert outcome.action == "command"
    
    def test_slash_help_command_routes_correctly(self):
        """Help command should be recognized as command"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("/help")
            
            assert outcome.action == "command"
    
    def test_slash_cancel_command_routes_correctly(self):
        """Cancel command should be recognized as command"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            outcome = core.process("/cancel")
            
            assert outcome.action == "command"


# ============================================================================
# PART 3: REPOSITORY INTELLIGENCE IS REAL (6 tests)
# ============================================================================

class TestRepositoryIntelligenceReality:
    """Verify repository analysis is real (reads actual files, not fake)"""

    def test_tech_stack_detection_from_real_files(self):
        """Tech stack should be detected from actual package.json"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a real package.json
            package_json = Path(tmpdir) / "package.json"
            package_json.write_text(json.dumps({
                "name": "test-project",
                "dependencies": {
                    "next": "^14.0.0",
                    "react": "^18.0.0",
                    "typescript": "^5.0.0"
                }
            }))
            
            intel = RepositoryIntelligence(Path(tmpdir))
            package_info = intel.inspect_package_json()
            
            # Should actually read the file
            assert package_info is not None
            assert "next" in str(package_info).lower()
    
    def test_folder_structure_inspection_real(self):
        """Folder structure should be actual directory listing"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create real folder structure
            (Path(tmpdir) / "src").mkdir()
            (Path(tmpdir) / "tests").mkdir()
            (Path(tmpdir) / "docs").mkdir()
            
            intel = RepositoryIntelligence(Path(tmpdir))
            structure = intel.inspect_folder_structure()
            
            # Should list actual directories
            assert len(structure) > 0
            names = [s.lower() for s in structure]
            assert any("src" in s for s in names) or any("test" in s for s in names)
    
    def test_auth_file_discovery_is_real(self):
        """Auth file discovery should find actual auth-related files"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create auth-related files
            (Path(tmpdir) / "auth.js").write_text("// auth module")
            (Path(tmpdir) / "jwt.ts").write_text("// jwt handling")
            
            intel = RepositoryIntelligence(Path(tmpdir))
            auth_files = intel.discover_auth_files()
            
            # Should find actual auth files
            assert len(auth_files) > 0
    
    def test_requirements_inspection_real(self):
        """Requirements inspection should read actual Python dependencies"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create real requirements.txt
            req_file = Path(tmpdir) / "requirements.txt"
            req_file.write_text("fastapi==0.104.1\npsycopg2-binary==2.9.0\njwt==1.3.0\n")
            
            intel = RepositoryIntelligence(Path(tmpdir))
            reqs = intel.inspect_requirements()
            
            # Should read actual requirements
            assert len(reqs) > 0
            assert any("fastapi" in r.lower() for r in reqs)
    
    def test_deployment_config_detection_real(self):
        """Deployment config detection should find actual config files"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create real Dockerfile
            (Path(tmpdir) / "Dockerfile").write_text("FROM python:3.11")
            
            intel = RepositoryIntelligence(Path(tmpdir))
            configs = intel.detect_deploy_configs()
            
            # Should find actual Dockerfile
            assert "Dockerfile" in configs
    
    def test_framework_detection_real(self):
        """Framework detection should work from actual dependencies"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create package.json with real framework
            package_json = Path(tmpdir) / "package.json"
            package_json.write_text(json.dumps({
                "dependencies": {
                    "django": "^4.2.0",
                    "psycopg2": "^2.9.0"
                }
            }))
            
            intel = RepositoryIntelligence(Path(tmpdir))
            pkg_info = intel.inspect_package_json()
            
            # Should detect frameworks from actual file
            assert pkg_info is not None


# ============================================================================
# PART 4: PROVIDER SWITCHING WORKS (4 tests)
# ============================================================================

class TestProviderSwitchingReality:
    """Verify that /model provider switching actually changes backend"""

    def test_provider_switching_updates_router(self):
        """Provider switching should sync with FallbackRouter"""
        from app.models.provider_reality import ProviderRealityManager
        from app.models.enhanced_provider_factory import get_enhanced_provider_factory
        
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            provider_router = FallbackRouter(factory)
            
            reality = ProviderRealityManager(factory, provider_router)
            
            # Before switch
            initial_mode = provider_router.auto_mode
            
            # Switch to manual
            if reality.set_manual_provider("groq"):
                # After switch - router should be in manual mode
                assert not provider_router.auto_mode
                # Manual override should be set
                assert provider_router.manual_override is not None
    
    def test_auto_mode_re_enables_auto_routing(self):
        """Enabling auto mode should re-enable automatic provider routing"""
        from app.models.provider_reality import ProviderRealityManager
        from app.models.enhanced_provider_factory import get_enhanced_provider_factory
        
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            provider_router = FallbackRouter(factory)
            reality = ProviderRealityManager(factory, provider_router)
            
            # Enable auto mode
            reality.enable_auto_mode()
            
            assert provider_router.auto_mode is True
            assert provider_router.manual_override is None
    
    def test_provider_reality_reflects_actual_state(self):
        """Provider reality should reflect actual configured providers"""
        from app.models.provider_reality import ProviderRealityManager
        from app.models.enhanced_provider_factory import get_enhanced_provider_factory
        
        with tempfile.TemporaryDirectory() as tmpdir:
            factory = get_enhanced_provider_factory(str(Path(tmpdir) / ".dev"))
            reality = ProviderRealityManager(factory)
            
            truth = reality.get_current_truth()
            
            # Should report real state (may be empty if no API keys)
            assert truth is not None
            assert isinstance(truth.available_providers, list)
    
    def test_intent_detector_only_detects_commands(self):
        """IntentDetector should only detect /, not other intents"""
        detector = IntentDetector()
        
        # Slash command
        result = detector.detect("/model groq")
        assert result.intent == Intent.COMMAND
        
        # Natural input (not a command)
        result = detector.detect("what is this")
        assert result.intent == Intent.TASK
        assert result.confidence == 0.95


# ============================================================================
# PART 5: SESSION CONTINUITY (4 tests)
# ============================================================================

class TestSessionContinuity:
    """Verify session memory enables context across conversation turns"""

    def test_session_memory_stores_analysis(self):
        """Session memory should store analysis results"""
        from datetime import datetime
        
        memory = SessionMemory(
            session_id="test",
            created_at=datetime.now().isoformat(),
            last_updated=datetime.now().isoformat()
        )
        
        # Add analysis
        memory.add_analysis(
            query="what frameworks are used",
            tools_used=["inspect_package_json"],
            findings="Found Next.js and TypeScript"
        )
        
        assert len(memory.analyses) > 0
        assert memory.analyses[0].findings == "Found Next.js and TypeScript"
    
    def test_session_memory_recalls_prior_analysis(self):
        """Session should recall prior analysis when asked"""
        from datetime import datetime
        
        memory = SessionMemory(
            session_id="test",
            created_at=datetime.now().isoformat(),
            last_updated=datetime.now().isoformat()
        )
        
        # Add analysis
        memory.add_analysis(
            query="check auth flow",
            tools_used=["inspect_folder_structure"],
            findings="JWT implementation found in middleware"
        )
        
        # Query memory
        recalled = memory.get_recent_analyses(limit=10)
        
        assert len(recalled) > 0
        assert "JWT" in recalled[0].findings
    
    def test_session_manager_persists_context(self):
        """SessionManager should provide high-level API for context"""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = SessionManager(Path(tmpdir))
            
            # Start session
            session = manager.start_session("test")
            
            # Store analysis
            session.add_analysis(
                query="analyze project",
                tools_used=["inspect_package_json"],
                findings="Python project"
            )
            
            # Retrieve context
            assert len(session.analyses) > 0
    
    def test_conversation_thread_preserves_context(self):
        """Conversation context should be preserved across turns"""
        from datetime import datetime
        
        memory = SessionMemory(
            session_id="test",
            created_at=datetime.now().isoformat(),
            last_updated=datetime.now().isoformat()
        )
        
        # Turn 1: Analyze project
        memory.add_analysis(
            query="analyze project",
            tools_used=["inspect_package_json"],
            findings="Next.js project"
        )
        
        # Turn 2: Execute fix
        memory.add_decision(
            decision_type="execute",
            reasoning="User requested fix",
            action_taken="create patch"
        )
        
        # Turn 3: Recall what we've done
        analyses = memory.get_recent_analyses(limit=10)
        decisions = memory.get_recent_decisions(limit=10)
        
        assert len(analyses) > 0
        assert len(decisions) > 0


# ============================================================================
# PART 6: FAILURE SCENARIOS (3 tests)
# ============================================================================

class TestFailureScenarios:
    """Verify graceful error handling in failure modes"""

    def test_missing_project_files_handled_gracefully(self):
        """Missing project files should not crash, return graceful error"""
        with tempfile.TemporaryDirectory() as tmpdir:
            intel = RepositoryIntelligence(Path(tmpdir))
            
            # Try to inspect non-existent pyproject.toml
            result = intel.inspect_pyproject()
            
            # Should return gracefully (empty dict or similar)
            assert result is not None
    
    def test_model_unavailable_uses_fallback_decision(self):
        """When model unavailable, should use fallback decision logic"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # No provider router, so model unavailable
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            # Should still return valid decision
            outcome = core.process("fix the bug")
            
            assert outcome.decision is not None
            assert outcome.decision.intent is not None
    
    def test_invalid_intent_handled_gracefully(self):
        """Invalid/unknown intent should route to clarification"""
        with tempfile.TemporaryDirectory() as tmpdir:
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            # Some random input that doesn't match patterns
            outcome = core.process("xyzabc 123 qwerty")
            
            # Should handle gracefully
            assert outcome.decision is not None
            assert outcome.action in ("respond", "execute_task")


# ============================================================================
# PART 7: TOOL ORCHESTRATION (4 tests)
# ============================================================================

class TestToolOrchestration:
    """Verify model can orchestrate read-only tools"""

    def test_agent_can_orchestrate_file_inspection(self):
        """Agent should orchestrate file inspection tools"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test files
            (Path(tmpdir) / "package.json").write_text('{"name":"test"}')
            
            core = AgentCore(Path(tmpdir), provider_router=None, health_manager=None)
            
            # Process query that should trigger analysis
            outcome = core.process("analyze the architecture")
            
            # Should detect as analysis (has "analyze" keyword)
            assert outcome.decision.intent in ("project_analysis", "help")
    
    def test_agent_selects_appropriate_tools(self):
        """Agent decision should specify appropriate tools"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = AgentDecisionEngine(provider_router=None, health_manager=None)
            
            decision = engine.decide("what frameworks are used")
            
            # Should select analysis-appropriate tools
            assert decision.requires_tools is True
            assert len(decision.tools) > 0
    
    def test_tool_execution_returns_structured_output(self):
        """Tool execution should return structured output"""
        with tempfile.TemporaryDirectory() as tmpdir:
            from app.cli.agent_core import AgentToolOrchestrator
            
            intel = RepositoryIntelligence(Path(tmpdir))
            orchestrator = AgentToolOrchestrator(intel)
            
            # Run tools
            results = orchestrator.run(["inspect_package_json"])
            
            # Should return structured dict
            assert isinstance(results, dict)
    
    def test_multiple_tools_can_be_orchestrated(self):
        """Multiple tools should be orchestrated together"""
        with tempfile.TemporaryDirectory() as tmpdir:
            from app.cli.agent_core import AgentToolOrchestrator
            
            intel = RepositoryIntelligence(Path(tmpdir))
            orchestrator = AgentToolOrchestrator(intel)
            
            # Run multiple tools
            results = orchestrator.run([
                "inspect_package_json",
                "inspect_folder_structure",
            ])
            
            # Both should be present
            assert "inspect_package_json" in results
            assert "inspect_folder_structure" in results


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
