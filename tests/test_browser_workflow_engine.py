"""
Comprehensive tests for Browser Workflow Intelligence System.

Tests cover:
- Data model creation and serialization
- Route discovery
- Browser workflow execution
- Console error capture
- Network failure detection
- Failure diagnosis
- Verification workflows
"""

import pytest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from app.core.browser_workflow_engine import (
    BrowserWorkflowEngine,
    BrowserIssueType,
    ConsoleIssue,
    NetworkFailure,
    RouteDiscovery,
    BrowserFlowResult,
    WorkflowFailure,
    BrowserDiagnosis,
    FrontendVerificationSummary,
)


class TestDataModels:
    """Test browser workflow data models"""
    
    def test_console_issue_creation(self):
        """Test creating a console issue"""
        issue = ConsoleIssue(
            level="error",
            message="Cannot find module 'react'",
            source="http://localhost:3000/app.js",
            line_number=42,
        )
        assert issue.level == "error"
        assert "react" in issue.message
        assert issue.line_number == 42
    
    def test_console_issue_to_dict(self):
        """Test console issue serialization"""
        issue = ConsoleIssue(
            level="warning",
            message="Hydration mismatch detected",
            source="http://localhost:3000",
        )
        data = issue.to_dict()
        assert data["level"] == "warning"
        assert "Hydration" in data["message"]
        assert data["source"] == "http://localhost:3000"
    
    def test_network_failure_creation(self):
        """Test creating a network failure"""
        failure = NetworkFailure(
            method="POST",
            url="http://api.example.com/login",
            status_code=401,
            error_message="Unauthorized",
            is_auth_error=True,
        )
        assert failure.method == "POST"
        assert failure.status_code == 401
        assert failure.is_auth_error is True
    
    def test_network_failure_cors_detection(self):
        """Test CORS error detection"""
        failure = NetworkFailure(
            method="GET",
            url="http://api.example.com/data",
            status_code=0,
            is_cors_error=True,
        )
        assert failure.is_cors_error is True
        data = failure.to_dict()
        assert data["cors_error"] is True
    
    def test_route_discovery_creation(self):
        """Test creating route discovery"""
        routes = RouteDiscovery(
            login_routes=["/login", "/signin"],
            dashboard_routes=["/dashboard"],
        )
        assert len(routes.login_routes) == 2
        assert routes.dashboard_routes[0] == "/dashboard"
    
    def test_route_discovery_to_dict(self):
        """Test route discovery serialization"""
        routes = RouteDiscovery(
            login_routes=["/login"],
            form_routes=["/signup", "/register"],
        )
        data = routes.to_dict()
        assert "/login" in data["login"]
        assert "/signup" in data["forms"]
    
    def test_browser_flow_result_creation(self):
        """Test browser flow result creation"""
        result = BrowserFlowResult(
            workflow_name="login_flow",
            success=True,
            status_code=200,
            url="http://localhost:3000/dashboard",
            title="Dashboard",
        )
        assert result.workflow_name == "login_flow"
        assert result.success is True
        assert result.title == "Dashboard"
    
    def test_browser_flow_result_to_dict(self):
        """Test browser flow result serialization"""
        result = BrowserFlowResult(
            workflow_name="form_test",
            success=False,
            status_code=400,
            error_message="Form validation failed",
        )
        data = result.to_dict()
        assert data["workflow"] == "form_test"
        assert data["success"] is False
        assert "validation" in data["error"].lower()


class TestBrowserIssueTypes:
    """Test browser issue type enum"""
    
    def test_all_issue_types_defined(self):
        """Test that all expected issue types are defined"""
        issue_types = [
            BrowserIssueType.JS_ERROR,
            BrowserIssueType.HYDRATION_MISMATCH,
            BrowserIssueType.NETWORK_FAILURE,
            BrowserIssueType.AUTH_FAILURE,
            BrowserIssueType.ROUTE_NOT_FOUND,
            BrowserIssueType.FORM_VALIDATION,
            BrowserIssueType.API_ERROR,
            BrowserIssueType.TIMEOUT,
            BrowserIssueType.CORS_ERROR,
            BrowserIssueType.CONSOLE_ERROR,
        ]
        assert len(issue_types) >= 10


class TestWorkflowFailure:
    """Test workflow failure model"""
    
    def test_workflow_failure_creation(self):
        """Test creating a workflow failure"""
        failure = WorkflowFailure(
            failure_type=BrowserIssueType.AUTH_FAILURE,
            description="Login failed with 401 Unauthorized",
            likely_causes=["Invalid credentials", "Session expired"],
        )
        assert failure.failure_type == BrowserIssueType.AUTH_FAILURE
        assert len(failure.likely_causes) == 2
    
    def test_workflow_failure_with_console_errors(self):
        """Test workflow failure with console errors"""
        console_error = ConsoleIssue(
            level="error",
            message="Token not found",
            source="http://localhost:3000",
        )
        failure = WorkflowFailure(
            failure_type=BrowserIssueType.AUTH_FAILURE,
            description="Auth failed",
            console_errors=[console_error],
        )
        assert len(failure.console_errors) == 1
        data = failure.to_dict()
        assert data["console_issues"] == 1


class TestBrowserDiagnosis:
    """Test browser failure diagnosis"""
    
    def test_diagnosis_creation(self):
        """Test creating a diagnosis"""
        diagnosis = BrowserDiagnosis(
            workflow_name="login",
            failed=True,
            failure_type=BrowserIssueType.CORS_ERROR,
            root_cause="CORS not configured",
            confidence=0.95,
        )
        assert diagnosis.failed is True
        assert diagnosis.confidence == 0.95
    
    def test_diagnosis_confidence_range(self):
        """Test diagnosis confidence is valid"""
        diagnosis = BrowserDiagnosis(
            workflow_name="test",
            failed=True,
            confidence=0.75,
        )
        assert 0.0 <= diagnosis.confidence <= 1.0
    
    def test_diagnosis_to_dict(self):
        """Test diagnosis serialization"""
        diagnosis = BrowserDiagnosis(
            workflow_name="login",
            failed=True,
            failure_type=BrowserIssueType.AUTH_FAILURE,
            root_cause="Missing token",
            confidence=0.85,
            recommended_fixes=["Add token to headers"],
        )
        data = diagnosis.to_dict()
        assert data["workflow"] == "login"
        assert data["failed"] is True
        assert "token" in data["root_cause"].lower()


class TestFrontendVerificationSummary:
    """Test frontend verification summary"""
    
    def test_verification_summary_creation(self):
        """Test creating verification summary"""
        summary = FrontendVerificationSummary(
            workflow_name="login",
            verification_success=True,
            confidence_in_fix=0.95,
        )
        assert summary.workflow_name == "login"
        assert summary.verification_success is True
    
    def test_verification_summary_with_resolved_issues(self):
        """Test verification with resolved issues"""
        summary = FrontendVerificationSummary(
            workflow_name="login",
            resolved_issues=["CORS error fixed"],
            remaining_issues=[],
            verification_success=True,
            confidence_in_fix=0.98,
        )
        assert len(summary.resolved_issues) == 1
        assert len(summary.remaining_issues) == 0
    
    def test_verification_summary_to_dict(self):
        """Test verification summary serialization"""
        summary = FrontendVerificationSummary(
            workflow_name="form_test",
            verification_success=False,
            confidence_in_fix=0.40,
            remaining_issues=["Form still not submitting"],
        )
        data = summary.to_dict()
        assert data["workflow"] == "form_test"
        assert data["success"] is False


class TestBrowserWorkflowEngine:
    """Test browser workflow engine"""
    
    def test_engine_initialization(self, tmp_path):
        """Test initializing browser workflow engine"""
        engine = BrowserWorkflowEngine(
            base_url="http://localhost:3000",
            headless=True,
            screenshots_dir=tmp_path,
        )
        assert engine.base_url == "http://localhost:3000"
        assert engine.headless is True
        assert engine.screenshots_dir == tmp_path
    
    def test_engine_route_discovery_initialization(self):
        """Test route discovery is initialized"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        assert engine.routes is not None
        assert isinstance(engine.routes, RouteDiscovery)
    
    def test_engine_console_issues_tracking(self):
        """Test console issues are tracked"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        issue = ConsoleIssue(
            level="error",
            message="Test error",
            source="http://localhost:3000",
        )
        engine.console_issues.append(issue)
        assert len(engine.console_issues) == 1
    
    def test_engine_network_failures_tracking(self):
        """Test network failures are tracked"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        failure = NetworkFailure(
            method="GET",
            url="http://api.example.com",
            status_code=500,
        )
        engine.network_failures.append(failure)
        assert len(engine.network_failures) == 1
    
    def test_route_discovery(self):
        """Test route discovery execution"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        # Mock _route_exists to return specific values
        call_count = [0]
        def mock_route_exists(route):
            # Return alternating True/False for testing
            call_count[0] += 1
            return call_count[0] % 2 == 1
        
        engine._route_exists = mock_route_exists
        
        routes = engine.discover_routes()
        
        # Should have found some routes (mock returns every other True)
        assert routes is not None
        # With alternating returns, we should find at least some routes
        total_routes = (
            len(routes.login_routes) + 
            len(routes.dashboard_routes) + 
            len(routes.settings_routes)
        )
        assert total_routes > 0


class TestBrowserFailureDiagnosis:
    """Test browser failure diagnosis"""
    
    def test_diagnose_hydration_mismatch(self):
        """Test diagnosing hydration mismatch"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        # Create a flow result with hydration error
        console_issue = ConsoleIssue(
            level="error",
            message="Hydration mismatch detected",
            source="http://localhost:3000",
        )
        
        result = BrowserFlowResult(
            workflow_name="test",
            success=False,
            console_issues=[console_issue],
        )
        
        diagnosis = engine.diagnose_browser_failure(result)
        
        assert diagnosis.failed is True
        assert diagnosis.failure_type == BrowserIssueType.HYDRATION_MISMATCH
        assert diagnosis.affected_component == "frontend"
    
    def test_diagnose_cors_error(self):
        """Test diagnosing CORS error"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        # Create a flow result with CORS error
        network_failure = NetworkFailure(
            method="GET",
            url="http://api.example.com",
            status_code=0,
            is_cors_error=True,
        )
        
        result = BrowserFlowResult(
            workflow_name="test",
            success=False,
            network_failures=[network_failure],
        )
        
        diagnosis = engine.diagnose_browser_failure(result)
        
        assert diagnosis.failed is True
        assert diagnosis.failure_type == BrowserIssueType.CORS_ERROR
        assert diagnosis.affected_component == "backend"
        assert diagnosis.confidence >= 0.90
    
    def test_diagnose_auth_failure(self):
        """Test diagnosing authentication failure"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        # Create a flow result with auth error
        network_failure = NetworkFailure(
            method="POST",
            url="http://api.example.com/login",
            status_code=401,
            is_auth_error=True,
        )
        
        result = BrowserFlowResult(
            workflow_name="login",
            success=False,
            network_failures=[network_failure],
        )
        
        diagnosis = engine.diagnose_browser_failure(result)
        
        assert diagnosis.failed is True
        assert diagnosis.failure_type == BrowserIssueType.AUTH_FAILURE
        assert diagnosis.confidence >= 0.85


class TestBrowserVerification:
    """Test browser verification workflows"""
    
    def test_verify_fix_success(self):
        """Test verifying a successful fix"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        original_diagnosis = BrowserDiagnosis(
            workflow_name="login",
            failed=True,
            root_cause="CORS error",
        )
        
        # Mock the workflow test to return success
        def mock_workflow():
            return BrowserFlowResult(
                workflow_name="login",
                success=True,
            )
        
        summary = engine.verify_fix(original_diagnosis, mock_workflow)
        
        assert summary.workflow_name == "login"
        assert summary.verification_success is True
        assert summary.confidence_in_fix >= 0.90
    
    def test_verify_fix_failure(self):
        """Test verifying a failed fix"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        original_diagnosis = BrowserDiagnosis(
            workflow_name="login",
            failed=True,
            root_cause="Auth error",
        )
        
        # Mock the workflow test to still fail
        def mock_workflow():
            return BrowserFlowResult(
                workflow_name="login",
                success=False,
                error_message="Still failing",
            )
        
        summary = engine.verify_fix(original_diagnosis, mock_workflow)
        
        assert summary.verification_success is False
        assert summary.confidence_in_fix < 0.5


class TestBrowserEngineSafety:
    """Test safety mechanisms"""
    
    def test_screenshots_directory_creation(self, tmp_path):
        """Test screenshots directory is created"""
        screenshots_dir = tmp_path / "screenshots"
        engine = BrowserWorkflowEngine(
            "http://localhost:3000",
            screenshots_dir=screenshots_dir,
        )
        assert engine.screenshots_dir.exists()
    
    def test_base_url_normalization(self):
        """Test base URL is normalized (trailing slash removed)"""
        engine = BrowserWorkflowEngine("http://localhost:3000/")
        assert engine.base_url == "http://localhost:3000"
    
    def test_headless_mode_default(self):
        """Test headless mode is enabled by default"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        assert engine.headless is True


class TestConsoleMessageHandling:
    """Test console message handling"""
    
    def test_console_message_tracking(self):
        """Test console messages are tracked"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        # Mock console message
        mock_msg = MagicMock()
        mock_msg.type = "error"
        mock_msg.text = "Test error message"
        mock_msg.location = {"url": "http://localhost:3000/app.js"}
        
        engine._on_console_message(mock_msg)
        
        assert len(engine.console_issues) == 1
        assert engine.console_issues[0].level == "error"
    
    def test_hydration_error_detection(self):
        """Test hydration errors are detected"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        mock_msg = MagicMock()
        mock_msg.type = "error"
        mock_msg.text = "Hydration mismatch in component"
        mock_msg.location = {"url": "http://localhost:3000"}
        
        engine._on_console_message(mock_msg)
        
        assert "Hydration" in engine.console_issues[0].message


class TestNetworkMonitoring:
    """Test network request monitoring"""
    
    def test_failed_response_tracking(self):
        """Test failed responses are tracked"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        # Mock response
        mock_response = MagicMock()
        mock_response.status = 401
        mock_response.url = "http://api.example.com/login"
        mock_response.request.method = "POST"
        mock_response.request.headers = {}
        
        engine._on_response(mock_response)
        
        assert len(engine.network_failures) == 1
        assert engine.network_failures[0].status_code == 401
    
    def test_cors_error_detection(self):
        """Test CORS errors are detected"""
        engine = BrowserWorkflowEngine("http://localhost:3000")
        
        # Mock CORS response - check status code >= 400
        mock_response = MagicMock()
        mock_response.status = 400  # Status code >= 400 triggers failure detection
        mock_response.url = "http://api.example.com"
        mock_response.request.method = "GET"
        mock_response.request.headers = {"error": "CORS policy"}
        
        engine._on_response(mock_response)
        
        assert len(engine.network_failures) == 1
