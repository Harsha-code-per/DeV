"""
Tests for Visible Tool Loop implementation.

Verifies that tool execution and reasoning are shown transparently to users.
"""

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.cli.tool_visibility import (
    ToolVisibilityLayer,
    ToolEvent,
    ReasoningExplanation,
    VisibleRepositoryIntelligence,
)
from app.cli.execution_visibility import ExecutionVisibilityManager
from app.cli.agent_core import AgentCore


class TestToolVisibilityLayer:
    """Tests for tool visibility display."""

    def test_show_reasoning_displays_hypothesis(self):
        """Reasoning should show likely causes and strategy."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        explanation = ReasoningExplanation(
            hypothesis="JWT validation failing in auth middleware",
            likely_causes=[
                "Expired JWT token not being refreshed",
                "Backend/frontend timestamp mismatch",
            ],
            investigation_steps=[
                "Check JWT expiration config",
                "Verify token refresh endpoint",
            ],
        )
        
        visibility.show_reasoning(explanation)
        
        full_output = "\n".join(output)
        assert "Likely causes:" in full_output
        assert "Expired JWT token" in full_output
        assert "Investigation strategy:" in full_output
        assert "Check JWT expiration" in full_output

    def test_start_tool_shows_bullet(self):
        """Starting tool should display with bullet."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        visibility.start_tool("read_package", "Reading package.json")
        
        assert any("● Reading package.json" in line for line in output)

    def test_complete_tool_updates_state(self):
        """Completing tool should update state."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        visibility.start_tool("read_config", "Reading config")
        visibility.complete_tool("read_config", "3 env vars found")
        
        events = visibility.current_tools
        assert len(events) == 1
        assert events[0].name == "read_config"
        assert events[0].status == "complete"
        assert events[0].output == "3 env vars found"

    def test_fail_tool_shows_error(self):
        """Failing tool should show error message."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        visibility.start_tool("inspect_db", "Inspecting database")
        visibility.fail_tool("inspect_db", "Connection refused on localhost:5432")
        
        full_output = "\n".join(output)
        assert "Failed: Connection refused" in full_output

    def test_show_structured_output_formats_items(self):
        """Structured output should format list as bullets."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        visibility.show_structured_output("Tech stack:", [
            "Next.js",
            "TypeScript",
            "PostgreSQL",
        ])
        
        full_output = "\n".join(output)
        assert "Tech stack:" in full_output
        assert "• Next.js" in full_output
        assert "• TypeScript" in full_output

    def test_show_verification_step_with_status(self):
        """Verification should show status symbol."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        visibility.show_verification_step("Login flow test", "pass")
        visibility.show_verification_step("Build verification", "fail")
        
        full_output = "\n".join(output)
        assert "✓ Login flow test" in full_output
        assert "✗ Build verification" in full_output

    def test_show_failure_explanation_professional(self):
        """Failure should show professional explanation."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        visibility.show_failure_explanation(
            title="Build Failed",
            details=[
                "TypeScript compilation error",
                "Missing type definitions in auth.ts",
            ],
            next_options=[
                "Check TypeScript configuration",
                "Install missing type packages",
            ],
        )
        
        full_output = "\n".join(output)
        assert "❌ Build Failed" in full_output
        assert "What failed:" in full_output
        assert "TypeScript compilation" in full_output
        assert "Next recommended steps:" in full_output
        assert "Check TypeScript configuration" in full_output


class TestExecutionVisibilityManager:
    """Tests for execution stage visibility."""

    def test_show_stage_sequence(self):
        """Stages should be tracked in sequence."""
        output = []
        manager = ExecutionVisibilityManager(emit_fn=output.append)
        
        manager.show_stage_start("planning", "Generating plan")
        manager.show_stage_complete("Plan ready")
        
        manager.show_stage_start("sandbox", "Creating sandbox")
        manager.show_stage_complete("Sandbox created")
        
        assert manager.state.stages_completed == ["planning", "sandbox"]

    def test_show_sandbox_info(self):
        """Should display sandbox path and branch."""
        output = []
        manager = ExecutionVisibilityManager(emit_fn=output.append)
        
        manager.show_sandbox_info("/tmp/worktree-123", "fix/auth-issue")
        
        full_output = "\n".join(output)
        assert "Sandbox: fix/auth-issue at /tmp/worktree-123" in full_output

    def test_show_diff_summary(self):
        """Should display file and line changes."""
        output = []
        manager = ExecutionVisibilityManager(emit_fn=output.append)
        
        manager.show_diff_summary(files_changed=3, insertions=45, deletions=12)
        
        full_output = "\n".join(output)
        assert "3 files changed" in full_output
        assert "+45 insertions" in full_output
        assert "-12 deletions" in full_output

    def test_show_verification_results(self):
        """Should track verification results."""
        output = []
        manager = ExecutionVisibilityManager(emit_fn=output.append)
        
        manager.show_verification_result("Unit tests", passed=True)
        manager.show_verification_result("Build", passed=False, detail="TypeScript error")
        
        assert "Unit tests: PASS" in manager.state.verification_results
        assert "Build: FAIL" in manager.state.verification_results


class TestVisibleRepositoryIntelligence:
    """Tests for visible repository analysis."""

    def test_inspect_tech_stack_visible(self):
        """Tech stack inspection should show visible steps."""
        output = []
        
        mock_intel = MagicMock()
        mock_intel.inspect_package_json.return_value = {"name": "my-app"}
        mock_intel.inspect_pyproject.return_value = {}
        mock_intel.detect_frameworks.return_value = ["Next.js", "TypeScript", "PostgreSQL"]
        
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        visible = VisibleRepositoryIntelligence(mock_intel, visibility)
        
        result = visible.inspect_tech_stack()
        
        full_output = "\n".join(output)
        assert "● Reading package.json" in full_output
        assert "● Reading pyproject.toml" in full_output
        assert "● Detecting frameworks" in full_output
        
        assert result["frameworks"] == ["Next.js", "TypeScript", "PostgreSQL"]

    def test_inspect_structure_visible(self):
        """Structure inspection should show visible steps."""
        output = []
        
        mock_intel = MagicMock()
        mock_intel.inspect_folder_structure.return_value = ["src/", "app/", "tests/"]
        mock_intel.detect_deploy_configs.return_value = ["Dockerfile", ".github/workflows/deploy.yml"]
        
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        visible = VisibleRepositoryIntelligence(mock_intel, visibility)
        
        result = visible.inspect_project_structure()
        
        full_output = "\n".join(output)
        assert "● Inspecting folder structure" in full_output
        assert "● Looking for deployment configs" in full_output


class TestAgentCoreVisibility:
    """Tests for agent core visible analysis."""

    def test_project_analysis_shows_visible_steps(self):
        """Project analysis should show visible tool execution."""
        output = []
        
        with patch("app.cli.agent_core.FallbackRouter"), \
             patch("app.cli.agent_core.HealthManager"), \
             patch("app.cli.agent_core.IntentDetector"):
            
            agent = AgentCore(
                project_root=Path("/tmp/test-repo"),
                provider_router=None,
                health_manager=None,
                emit_fn=output.append,
            )
            
            # Mock the visible intelligence methods
            agent.visible_intel.inspect_tech_stack = MagicMock(return_value={
                "frameworks": ["Next.js", "TypeScript"],
            })
            
            # Mock decision to return project_analysis intent
            agent.decision_engine.decide = MagicMock(return_value=MagicMock(
                intent="project_analysis",
                tools=[],
                requires_clarification=False,
                response_strategy="analyze_then_reply",
                needs_approval=False,
                risk_level="low",
            ))
            
            outcome = agent.process("what is my tech stack?")
            
            assert outcome.action == "respond"
            full_output = "\n".join(output)
            # Should have called visible inspection
            agent.visible_intel.inspect_tech_stack.assert_called_once()


class TestAcceptanceVisibleToolLoop:
    """End-to-end acceptance tests for visible tool loop."""

    def test_visible_repo_analysis_workflow(self):
        """Complete visible repo analysis should show all steps."""
        output = []
        visibility = ToolVisibilityLayer(emit_fn=output.append)
        
        # Simulate visible analysis steps
        explanation = ReasoningExplanation(
            hypothesis="Need to understand project structure for auth implementation",
            likely_causes=[
                "Unclear JWT integration point",
                "Missing auth middleware detection",
            ],
            investigation_steps=[
                "Inspect frontend dependencies",
                "Check backend auth entry point",
            ],
        )
        
        visibility.show_reasoning(explanation)
        visibility.start_tool("read_package", "Reading package.json")
        visibility.complete_tool("read_package", "found Next.js/TypeScript")
        
        visibility.start_tool("list_structure", "Inspecting folder structure")
        visibility.complete_tool("list_structure", "found 5 top-level folders")
        
        visibility.show_structured_output("Tech stack:", [
            "Next.js",
            "TypeScript",
            "PostgreSQL",
        ])
        
        full_output = "\n".join(output)
        
        # Verify visible steps are shown
        assert "Likely causes:" in full_output
        assert "● Reading package.json" in full_output
        assert "● Inspecting folder structure" in full_output
        assert "Tech stack:" in full_output
        assert "• Next.js" in full_output

    def test_visible_execution_workflow(self):
        """Complete execution should show all visible stages."""
        output = []
        manager = ExecutionVisibilityManager(emit_fn=output.append)
        
        # Simulate execution workflow
        manager.show_stage_start("planning", "Generating implementation plan")
        manager.show_stage_complete("Plan ready for review")
        
        manager.show_stage_start("sandbox_creation", "Creating isolated sandbox")
        manager.show_sandbox_info("/tmp/worktree-fix-auth", "fix/auth-jwt")
        
        manager.show_stage_start("execution", "Executing task in sandbox")
        manager.show_stage_complete("Execution succeeded")
        
        manager.show_stage_start("verification", "Running verification checks")
        manager.show_verification_result("Unit tests", passed=True, detail="34 passed")
        manager.show_verification_result("Integration tests", passed=True)
        
        manager.show_stage_start("diff_generation", "Collecting git diff")
        manager.show_diff_summary(files_changed=2, insertions=87, deletions=5)
        
        manager.show_stage_start("applying", "Applying changes to main")
        manager.show_stage_complete("Changes applied successfully")
        manager.show_approval_ready()
        
        full_output = "\n".join(output)
        
        # Verify all stages visible
        assert "● Generating implementation plan" in full_output
        assert "● Creating isolated sandbox" in full_output
        assert "● Executing task in sandbox" in full_output
        assert "● Running verification checks" in full_output
        assert "2 files changed" in full_output
        assert "Ready for merge" in full_output or "Ready for final approval" in full_output
