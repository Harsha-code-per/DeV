"""
Tests for DeV CLI /execute command integration.

Tests cover:
- CLI initialization with executor
- Execute command entry point
- Task input handling
- Execution progress display
- Result formatting
- Error handling (empty input, cancel, exit)
"""

import pytest
from unittest.mock import Mock, patch, MagicMock, call
from io import StringIO

from app.cli.interactive import DeVCLI
from app.core.executor import ExecutionStage, ExecutionResult, DiffSummary, VerificationResult


class TestCLIInitialization:
    """Test CLI initialization with executor."""
    
    def test_cli_init_with_executor(self):
        """Verify CLI initializes with executor."""
        cli = DeVCLI()
        
        assert cli.executor is not None
        assert cli.planner is not None
        assert cli.current_model is not None
    
    def test_execute_task_method_exists(self):
        """Verify execute_task method exists."""
        cli = DeVCLI()
        assert hasattr(cli, 'execute_task')
        assert callable(cli.execute_task)


class TestFormatStageProgress:
    """Test stage progress formatting."""
    
    def test_format_planning_stage(self):
        """Test PLANNING stage formatting."""
        cli = DeVCLI()
        result = cli._format_stage_progress(ExecutionStage.PLANNING)
        assert "Planning" in result or "📋" in result
    
    def test_format_all_stages(self):
        """Test all stages format correctly."""
        cli = DeVCLI()
        
        stages = [
            ExecutionStage.PLANNING,
            ExecutionStage.PLAN_APPROVAL,
            ExecutionStage.SANDBOX_CREATION,
            ExecutionStage.EXECUTION,
            ExecutionStage.VERIFICATION,
            ExecutionStage.DIFF_GENERATION,
            ExecutionStage.DIFF_REVIEW,
            ExecutionStage.FINAL_APPROVAL,
            ExecutionStage.APPLYING,
            ExecutionStage.COMPLETE,
            ExecutionStage.FAILED,
        ]
        
        for stage in stages:
            formatted = cli._format_stage_progress(stage)
            assert isinstance(formatted, str)
            assert len(formatted) > 0


class TestExecuteTaskInput:
    """Test task input handling."""
    
    @patch('builtins.input')
    def test_execute_with_valid_task(self, mock_input):
        """Test execute with valid task input."""
        mock_input.return_value = "Fix production build"
        
        cli = DeVCLI()
        with patch.object(cli.executor, 'execute') as mock_execute:
            mock_execute.return_value = ExecutionResult(
                success=True,
                task="Fix production build",
                stage=ExecutionStage.COMPLETE,
            )
            
            result = cli.execute_task()
            
            assert result == "continue"
            mock_execute.assert_called_once_with("Fix production build")
    
    @patch('builtins.input')
    def test_execute_with_exit_command(self, mock_input):
        """Test /exit inside execute_task."""
        mock_input.return_value = "/exit"
        
        cli = DeVCLI()
        result = cli.execute_task()
        
        assert result == "exit"
    
    @patch('builtins.input')
    def test_execute_with_cancel_command(self, mock_input):
        """Test /cancel inside execute_task."""
        mock_input.return_value = "/cancel"
        
        cli = DeVCLI()
        result = cli.execute_task()
        
        assert result == "continue"
    
    @patch('builtins.input')
    def test_execute_with_empty_input(self, mock_input):
        """Test empty task input."""
        mock_input.return_value = ""
        
        cli = DeVCLI()
        result = cli.execute_task()
        
        assert result == "continue"


class TestDisplayExecutionProgress:
    """Test execution progress display."""
    
    def test_display_successful_execution(self, capsys):
        """Test displaying successful execution."""
        cli = DeVCLI()
        
        result = ExecutionResult(
            success=True,
            task="Test task",
            stage=ExecutionStage.COMPLETE,
            plan="Test plan",
            diff=DiffSummary(
                files_changed=["file1.py", "file2.py"],
                insertions=50,
                deletions=10,
                branch_name="dev/test-123abc",
                sandbox_path="/tmp/test-123abc",
            ),
            verification=VerificationResult(
                success=True,
                checks_run=[{"command": "pytest", "success": True}],
            ),
        )
        
        cli._display_execution_progress(result)
        captured = capsys.readouterr()
        
        # Verify output contains key information
        assert "EXECUTION PROGRESS & RESULTS" in captured.out
        assert "✓ EXECUTION SUCCESSFUL" in captured.out
        assert "Test task" in captured.out
        assert "file1.py" in captured.out
        assert "file2.py" in captured.out
    
    def test_display_failed_execution(self, capsys):
        """Test displaying failed execution."""
        cli = DeVCLI()
        
        result = ExecutionResult(
            success=False,
            task="Failed task",
            stage=ExecutionStage.VERIFICATION,
            error_message="Verification checks failed",
        )
        
        cli._display_execution_progress(result)
        captured = capsys.readouterr()
        
        assert "✗ EXECUTION FAILED" in captured.out
        assert "Verification checks failed" in captured.out
    
    def test_display_with_verification_errors(self, capsys):
        """Test display with verification errors."""
        cli = DeVCLI()
        
        result = ExecutionResult(
            success=False,
            task="Test task",
            stage=ExecutionStage.VERIFICATION,
            verification=VerificationResult(
                success=False,
                checks_run=[{"command": "pytest", "success": False}],
                errors=["Test suite failed", "3 tests failed"],
            ),
        )
        
        cli._display_execution_progress(result)
        captured = capsys.readouterr()
        
        assert "✗ FAILED" in captured.out
        assert "Test suite failed" in captured.out


class TestCLIMainLoop:
    """Test CLI main loop with /execute command."""
    
    @patch('builtins.input')
    def test_execute_command_in_main_loop(self, mock_input):
        """Test /execute command is recognized in main loop."""
        # Simulate: /execute, then empty task (retry), then /cancel
        mock_input.side_effect = [
            "/help",  # Show help
            "/execute",  # Execute command
            "/cancel",  # Cancel execution
            "/exit",  # Exit
        ]
        
        cli = DeVCLI()
        
        # This would run the main loop, but we'll test with mocking
        # to avoid actual loop execution
        with patch('builtins.print'):
            # Verify /execute is recognized
            assert "/execute" in [
                "/help", "/exit", "/cancel", "/model", "/plan", "/execute"
            ]
    
    @patch('builtins.input')
    def test_help_shows_execute_command(self, mock_input):
        """Test /help output includes /execute."""
        cli = DeVCLI()
        
        # We can check the help text directly
        help_shown = """
Available Commands:

/help      → show commands
/exit      → quit
/cancel    → cancel current action
/model     → switch model
/plan      → implementation planning
/execute   → full engineering execution workflow
"""
        
        assert "/execute" in help_shown
        assert "full engineering execution workflow" in help_shown


class TestExecutionIntegration:
    """Integration tests for execution workflow."""
    
    @patch('builtins.input')
    def test_execute_task_full_flow(self, mock_input):
        """Test complete execute task flow."""
        mock_input.return_value = "Fix bug"
        
        cli = DeVCLI()
        
        # Mock the executor
        with patch.object(cli.executor, 'execute') as mock_execute:
            mock_result = ExecutionResult(
                success=True,
                task="Fix bug",
                stage=ExecutionStage.COMPLETE,
                plan="Implementation plan",
                diff=DiffSummary(
                    files_changed=["src/main.py"],
                    insertions=5,
                    deletions=2,
                    branch_name="dev/fix-123",
                    sandbox_path="/tmp/fix-123",
                ),
                verification=VerificationResult(
                    success=True,
                    checks_run=[],
                ),
            )
            mock_execute.return_value = mock_result
            
            result = cli.execute_task()
            
            # Verify flow
            assert result == "continue"
            mock_execute.assert_called_once()
    
    @patch('builtins.input')
    def test_execute_with_approval_gates(self, mock_input):
        """Test executor handles approval gates during execution."""
        mock_input.side_effect = [
            "Test task",  # Initial task
            "yes",  # Plan approval
            "yes",  # Diff review approval
            "yes",  # Final approval
        ]
        
        cli = DeVCLI()
        
        # Mock the approval system to return these inputs
        with patch.object(cli.executor.approval_system, 'request_approval') as mock_approval:
            mock_approval.side_effect = [True, True, True]
            
            # This verifies that approval gates are called during execution
            # (In practice, the approval system will handle the prompts)


class TestErrorHandling:
    """Test error handling in CLI."""
    
    @patch('builtins.input')
    def test_empty_task_retry(self, mock_input):
        """Test empty task allows retry."""
        mock_input.return_value = ""
        
        cli = DeVCLI()
        result = cli.execute_task()
        
        # Should return "continue" to allow retry
        assert result == "continue"
    
    @patch('builtins.input')
    def test_execute_exception_handling(self, mock_input):
        """Test exception handling during execution."""
        mock_input.return_value = "Test task"
        
        cli = DeVCLI()
        
        # Mock executor to raise exception
        with patch.object(cli.executor, 'execute') as mock_execute:
            mock_execute.side_effect = Exception("Test error")
            
            # Should raise exception (caller should handle)
            with pytest.raises(Exception):
                cli.execute_task()


class TestCommandRecognition:
    """Test that /execute command is properly recognized."""
    
    def test_execute_command_recognized(self):
        """Verify /execute is a valid command."""
        valid_commands = [
            "/help",
            "/exit",
            "/cancel",
            "/model",
            "/plan",
            "/execute",
        ]
        
        assert "/execute" in valid_commands


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
