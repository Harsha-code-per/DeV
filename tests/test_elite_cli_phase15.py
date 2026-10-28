"""
Tests for Elite CLI Phase 1.5 — Orchestration + Execution

Test Coverage:
- Conversation engine workflows
- Small task routing
- Large task markdown workflow
- Approval conversation UX
- File reference loading
- Result summaries
- State management
"""

import pytest
import tempfile
from pathlib import Path

from app.cli.conversation_engine import ConversationEngine, ConversationState
from app.cli.task_classifier import TaskClassifier
from app.cli.elite_models import TaskSize, TaskType
from app.cli.elite_cli_runner import EliteCLIRunner


class TestConversationEngine:
    """Test conversation engine orchestration"""
    
    def test_conversation_engine_initialization(self):
        """Test initializing conversation engine"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            assert engine.state is not None
            assert (Path(tmpdir) / ".dev").exists()

    def test_greeting_routes_to_task_processing(self):
        """Greeting input should be processed as a natural task (LLM-first)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            msg_type, message = engine.process_user_input("hi")

            # Greeting goes through task classification (LLM-first architecture)
            assert msg_type in {"small_task", "large_task"}

    def test_help_request_routes_to_task_processing(self):
        """Help request should be processed as a natural task (LLM-first)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            msg_type, message = engine.process_user_input("what can you do")

            # Help request goes through task classification (LLM-first architecture)
            assert msg_type in {"small_task", "large_task"}

    def test_clarification_routes_to_task_processing(self):
        """Clarification request should be processed as a natural task (LLM-first)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            msg_type, message = engine.process_user_input("why did this fail")

            # Clarification goes through task classification (LLM-first architecture)
            assert msg_type in {"small_task", "large_task"}
    
    def test_small_task_detection(self):
        """Test detecting small tasks"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            msg_type, message = engine.process_natural_task("Fix the login bug")
            
            assert msg_type == "small_task"
            assert "Small task" in message or "30 minutes" in message
            assert engine.state.task_request is not None

    def test_task_intent_routes_to_execution_workflow(self):
        """Task intent should route to small/large task flow."""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))

            msg_type, message = engine.process_user_input("Fix login bug")
            assert msg_type in {"small_task", "large_task"}
            assert "Ready to proceed" in message or "Plan saved" in message
    
    def test_large_task_detection(self):
        """Test detecting large tasks"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            msg_type, message = engine.process_natural_task("Build JWT authentication system")
            
            assert msg_type == "large_task"
            assert "Large task" in message or "implementation plan" in message
            assert engine.state.plan is not None
    
    def test_markdown_plan_generation(self):
        """Test generating markdown plan"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            msg_type, message = engine.process_natural_task("Build payment system")
            
            assert msg_type == "large_task"
            assert ".dev/plans/" in message
            assert engine.state.plan_file is not None
            assert engine.state.plan_file.exists()
    
    def test_approval_yes_response(self):
        """Test approval acceptance"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            engine.process_natural_task("Fix bug")
            
            message, action = engine.handle_approval_response("yes")
            
            assert action == "execute"
            assert "✅" in message or "Approval" in message
    
    def test_approval_no_response(self):
        """Test approval rejection"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            engine.process_natural_task("Fix bug")
            
            message, action = engine.handle_approval_response("no")
            
            assert action == "cancel"
            assert "cancel" in message.lower() or "declined" in message.lower()
    
    def test_file_reference_loading(self):
        """Test @file reference loading"""
        with tempfile.TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            engine = ConversationEngine(project_root)
            
            # Create a test plan file
            plans_dir = project_root / ".dev" / "plans"
            plans_dir.mkdir(parents=True, exist_ok=True)
            test_file = plans_dir / "test-plan.md"
            test_file.write_text("# Test Plan\n\nThis is a test plan.")
            
            # Load reference
            content = engine.load_file_reference("@test-plan")
            
            assert content is not None
            assert "Test Plan" in content
    
    def test_result_summary_generation(self):
        """Test generating result summary"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            result = {
                "status": "success",
                "changed_files": ["auth.py", "test_auth.py"],
                "verification": {
                    "tests_passed": 10,
                    "tests_total": 10
                }
            }
            
            summary = engine.generate_result_summary(result)
            
            assert "✅" in summary
            assert "What changed" in summary or "changed_files" in summary.lower()
    
    def test_conversation_state_reset(self):
        """Test resetting conversation state"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            # Set up state
            engine.process_natural_task("Fix bug")
            assert engine.state.task_request is not None
            
            # Reset
            engine.reset()
            
            assert engine.state.task_request is None
            assert engine.state.plan is None


class TestEliteCLIRunner:
    """Test elite CLI runner"""
    
    def test_runner_initialization(self):
        """Test initializing CLI runner"""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(
                project_root=Path(tmpdir),
                model_name="Test Model",
                provider="Test Provider"
            )
            
            assert runner.model_name == "Test Model"
            assert runner.provider == "Test Provider"
            assert runner.engine is not None
            assert runner.router is not None
    
    def test_context_display_update(self):
        """Test context display update (BACKEND-FIRST TRUTH)"""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(
                project_root=Path(tmpdir),
                model_name="Test Model",
                provider="Test Provider"
            )
            
            # Backend-first: context shows whatever is configured
            # If no providers configured, provider_id will be empty
            truth = runner.model_control.reality_manager.get_current_truth()
            if truth.has_any_available_provider:
                # If providers configured, they should match
                assert runner.context.provider == runner.model_control.current_config.provider_id
            else:
                # If no providers configured, display shows that
                assert runner.model_control.current_config.provider_id == ""
    
    def test_command_help(self):
        """Test /help command"""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            
            # Help command should not raise error
            runner._handle_command("help", None)
    
    def test_command_doctor(self):
        """Test /doctor diagnostics"""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            
            # Doctor command should not raise error
            runner._handle_command("doctor", None)
    
    def test_command_model(self, capsys):
        """Test /model premium control center command."""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            
            runner._handle_command("model", None)
            captured = capsys.readouterr()
            assert "Model Control Center" in captured.out

            runner._handle_command("model", "auto")
            assert runner.model_control.current_config.auto_mode is True

    def test_execute_command_empty_task(self, capsys, monkeypatch):
        """Test /execute handles empty task input."""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            monkeypatch.setattr("builtins.input", lambda _prompt="": "")
            runner._handle_command("execute", None)
            captured = capsys.readouterr()
            assert "Task cannot be empty" in captured.out

    def test_execute_command_cancel(self, capsys, monkeypatch):
        """Test /execute handles /cancel gracefully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = EliteCLIRunner(project_root=Path(tmpdir))
            monkeypatch.setattr("builtins.input", lambda _prompt="": "/cancel")
            runner._handle_command("execute", None)
            captured = capsys.readouterr()
            assert "Execution cancelled" in captured.out


class TestTaskWorkflows:
    """Test complete task workflows"""
    
    def test_small_task_complete_flow(self):
        """Test complete small task workflow"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            # 1. Classify small task
            msg_type, message = engine.process_natural_task("Fix login validation")
            assert msg_type == "small_task"
            
            # 2. Handle approval
            _, action = engine.handle_approval_response("yes")
            assert action == "execute"
            
            # 3. Generate result
            result = {
                "status": "success",
                "changed_files": ["auth.py"],
                "verification": {"tests_passed": 5, "tests_total": 5}
            }
            summary = engine.generate_result_summary(result)
            assert "✅" in summary
    
    def test_large_task_complete_flow(self):
        """Test complete large task workflow"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            # 1. Classify large task
            msg_type, message = engine.process_natural_task("Build payment processing system")
            assert msg_type == "large_task"
            
            # 2. Verify plan created
            assert engine.state.plan is not None
            assert engine.state.plan_file is not None
            assert engine.state.plan_file.exists()
            
            # 3. Read plan
            plan_content = engine.state.plan_file.read_text()
            assert "Implementation Plan" in plan_content or "# " in plan_content

    def test_execution_summary_quality(self):
        """Result summary should include elite concise sections."""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            summary = engine.generate_result_summary({
                "success": True,
                "stage": "complete",
                "diff": {
                    "files_changed": ["auth.py", "tests/test_auth.py"],
                    "insertions": 15,
                    "deletions": 4,
                },
                "verification": {"success": True},
                "metadata": {"browser_validation": "passed"},
                "patch_summary": {"root_cause_found": "session token mismatch"},
            })

            assert "What changed" in summary
            assert "Why it changed" in summary
            assert "Verification result" in summary
            assert "Browser verification" in summary
            assert "Diff review summary" in summary
            assert "Final approval" in summary

    def test_failure_recovery_summary_quality(self):
        """Failure summary should explain failure and next options."""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            summary = engine.generate_result_summary({
                "success": False,
                "stage": "verification",
                "error_message": "tests failed",
                "plan": "generated",
            })

            assert "What failed" in summary
            assert "What was attempted" in summary
            assert "Likely next options" in summary


class TestApprovalUX:
    """Test approval UX"""
    
    def test_approval_variants(self):
        """Test different approval response variants"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            engine.process_natural_task("Fix bug")
            
            # Test different approval variants
            for response in ["yes", "proceed", "ok", "approved"]:
                _, action = engine.handle_approval_response(response)
                assert action == "execute"
            
            # Test different rejection variants
            for response in ["no", "cancel", "skip", "abort"]:
                _, action = engine.handle_approval_response(response)
                assert action == "cancel"
    
    def test_approval_show_plan(self):
        """Test showing plan during approval"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            engine.process_natural_task("Build system")
            
            # Save the plan
            if engine.state.plan:
                engine.plan_builder.build_and_save(engine.state.plan)
            
            # Request to show plan
            message, action = engine.handle_approval_response("review")
            
            # Should show plan content
            assert action is None
            assert "Plan" in message or "#" in message

    def test_approval_message_has_trust_sections(self):
        """Approval prompt should include elite trust UX sections."""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            msg_type, message = engine.process_natural_task("Fix login bug")

            assert msg_type == "small_task"
            assert "Likely work" in message
            assert "Files likely affected" in message
            assert "Verification plan" in message
            assert "Risk" in message


class TestMemoryIntegration:
    """Test memory engine integration hooks"""
    
    def test_task_with_memory_context(self):
        """Test task processing with memory (mock)"""
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = ConversationEngine(Path(tmpdir))
            
            # Process task with None memory (graceful fallback)
            msg_type, message = engine.process_natural_task("Fix bug", memory_engine=None)
            
            assert msg_type == "small_task"
            # Should work without memory


class TestConversationState:
    """Test conversation state management"""
    
    def test_state_initialization(self):
        """Test initial state"""
        state = ConversationState()
        
        assert state.task_request is None
        assert state.plan is None
        assert state.approval_granted is False
    
    def test_state_transitions(self):
        """Test state transitions during workflow"""
        state = ConversationState()
        
        # Move through states
        from app.cli.elite_models import NaturalTaskRequest
        state.task_request = NaturalTaskRequest(
            raw_text="Fix bug",
            task_type=TaskType.BUG_FIX,
            task_size=TaskSize.SMALL
        )
        assert state.task_request is not None
        
        state.in_approval_workflow = True
        assert state.in_approval_workflow is True
        
        state.approval_granted = True
        assert state.approval_granted is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
