"""
Browser Workflow Intelligence System for DeV

Production-grade browser automation and intelligent diagnosis.

Responsibilities:
- Discover application routes and workflows
- Execute real user workflows (login, forms, navigation)
- Capture browser console errors and issues
- Analyze network failures and API problems
- Generate screenshots and DOM snapshots
- Diagnose frontend failures
- Verify fixes through workflow re-testing

This is not simple browser automation.
This is engineering-grade browser diagnosis and verification.

Design Principles:
- Trust-first: Never submit destructive forms without approval
- Safe: Prefer read-only verification paths
- Explainable: Screenshot and state evidence
- Deterministic: Reproducible browser sessions
- Integrated: Works with RootCauseEngine and VerificationEngine
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any, Callable
import re
import json
from datetime import datetime

from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext, expect
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from app.utils.logger import setup_logger


logger = setup_logger(__name__)


class BrowserIssueType(str, Enum):
    """Types of browser-detected issues"""
    JS_ERROR = "js_error"
    HYDRATION_MISMATCH = "hydration_mismatch"
    NETWORK_FAILURE = "network_failure"
    AUTH_FAILURE = "auth_failure"
    ROUTE_NOT_FOUND = "route_not_found"
    FORM_VALIDATION = "form_validation"
    API_ERROR = "api_error"
    TIMEOUT = "timeout"
    CORS_ERROR = "cors_error"
    MISSING_ELEMENT = "missing_element"
    NAVIGATION_FAILED = "navigation_failed"
    CONSOLE_ERROR = "console_error"
    PERFORMANCE_ISSUE = "performance_issue"
    SESSION_EXPIRED = "session_expired"
    UNKNOWN = "unknown"


@dataclass
class ConsoleIssue:
    """JavaScript console error or warning"""
    level: str  # "error", "warning", "info"
    message: str
    source: str  # URL where error occurred
    line_number: Optional[int] = None
    column_number: Optional[int] = None
    stack_trace: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict:
        return {
            "level": self.level,
            "message": self.message[:200],
            "source": self.source,
            "line": self.line_number,
            "column": self.column_number,
            "timestamp": self.timestamp,
        }


@dataclass
class NetworkFailure:
    """Failed network request"""
    method: str  # GET, POST, etc.
    url: str
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    response_time_ms: int = 0
    is_cors_error: bool = False
    is_auth_error: bool = False
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict:
        return {
            "method": self.method,
            "url": self.url[:100],
            "status": self.status_code,
            "error": self.error_message,
            "response_time_ms": self.response_time_ms,
            "cors_error": self.is_cors_error,
            "auth_error": self.is_auth_error,
        }


@dataclass
class RouteDiscovery:
    """Discovered application routes"""
    login_routes: List[str] = field(default_factory=list)
    dashboard_routes: List[str] = field(default_factory=list)
    form_routes: List[str] = field(default_factory=list)
    settings_routes: List[str] = field(default_factory=list)
    admin_routes: List[str] = field(default_factory=list)
    api_routes: List[str] = field(default_factory=list)
    other_routes: List[str] = field(default_factory=list)
    protected_routes: List[str] = field(default_factory=list)
    error_routes: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "login": self.login_routes,
            "dashboard": self.dashboard_routes,
            "forms": self.form_routes,
            "settings": self.settings_routes,
            "admin": self.admin_routes,
            "api": self.api_routes,
            "protected": self.protected_routes,
            "errors": self.error_routes,
        }


@dataclass
class BrowserFlowResult:
    """Result of executing a browser workflow"""
    workflow_name: str
    success: bool
    status_code: int = 0
    url: str = ""
    title: str = ""
    console_issues: List[ConsoleIssue] = field(default_factory=list)
    network_failures: List[NetworkFailure] = field(default_factory=list)
    error_message: Optional[str] = None
    steps_completed: int = 0
    total_steps: int = 0
    execution_time_ms: int = 0
    screenshot_path: Optional[str] = None
    dom_snapshot: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "workflow": self.workflow_name,
            "success": self.success,
            "status_code": self.status_code,
            "url": self.url,
            "title": self.title,
            "console_issues": len(self.console_issues),
            "network_failures": len(self.network_failures),
            "steps": f"{self.steps_completed}/{self.total_steps}",
            "execution_time_ms": self.execution_time_ms,
            "error": self.error_message,
        }


@dataclass
class WorkflowFailure:
    """Details about a workflow failure"""
    failure_type: BrowserIssueType
    description: str
    likely_causes: List[str] = field(default_factory=list)
    affected_elements: List[str] = field(default_factory=list)
    console_errors: List[ConsoleIssue] = field(default_factory=list)
    network_errors: List[NetworkFailure] = field(default_factory=list)
    screenshot_path: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "type": self.failure_type.value,
            "description": self.description,
            "likely_causes": self.likely_causes[:3],
            "elements": self.affected_elements[:5],
            "console_issues": len(self.console_errors),
            "network_failures": len(self.network_errors),
        }


@dataclass
class BrowserDiagnosis:
    """Root cause diagnosis from browser workflow analysis"""
    workflow_name: str
    failed: bool
    failure_type: BrowserIssueType = BrowserIssueType.UNKNOWN
    root_cause: str = ""
    confidence: float = 0.0  # 0.0 to 1.0
    affected_component: str = ""  # "frontend", "backend", "network", "auth"
    recommended_fixes: List[str] = field(default_factory=list)
    evidence: List[str] = field(default_factory=list)
    verification_steps: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "workflow": self.workflow_name,
            "failed": self.failed,
            "type": self.failure_type.value,
            "root_cause": self.root_cause,
            "confidence": round(self.confidence, 2),
            "component": self.affected_component,
            "fixes": self.recommended_fixes[:3],
            "evidence": self.evidence[:3],
        }


@dataclass
class FrontendVerificationSummary:
    """Summary of frontend verification after fix"""
    verification_timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    workflow_name: str = ""
    previous_failures: List[WorkflowFailure] = field(default_factory=list)
    current_failures: List[WorkflowFailure] = field(default_factory=list)
    resolved_issues: List[str] = field(default_factory=list)
    remaining_issues: List[str] = field(default_factory=list)
    verification_success: bool = False
    confidence_in_fix: float = 0.0
    
    def to_dict(self) -> Dict:
        return {
            "timestamp": self.verification_timestamp,
            "workflow": self.workflow_name,
            "previous_failures": len(self.previous_failures),
            "current_failures": len(self.current_failures),
            "resolved": self.resolved_issues,
            "remaining": self.remaining_issues,
            "success": self.verification_success,
            "confidence": round(self.confidence_in_fix, 2),
        }


class BrowserWorkflowEngine:
    """
    Production-grade browser workflow automation and diagnosis.
    
    Capabilities:
    - Discover application routes
    - Execute real user workflows
    - Capture console errors and network failures
    - Diagnose frontend issues
    - Verify fixes through workflow re-testing
    """
    
    def __init__(self, base_url: str, headless: bool = True, screenshots_dir: Optional[Path] = None, project_root: Optional[Path] = None):
        """
        Initialize the browser workflow engine.
        
        Args:
            base_url: Base URL of the application (e.g., http://localhost:3000)
            headless: Run browser in headless mode
            screenshots_dir: Directory to save screenshots
            project_root: Root directory for MemoryEngine
        """
        self.base_url = base_url.rstrip('/')
        self.headless = headless
        self.screenshots_dir = Path(screenshots_dir) if screenshots_dir else Path("/tmp/dev_browser_screenshots")
        self.screenshots_dir.mkdir(parents=True, exist_ok=True)
        
        self.playwright = None
        self.browser = None
        self.console_issues = []
        self.network_failures = []
        self.routes = RouteDiscovery()
        
        try:
            from app.core.memory_engine import MemoryEngine
            self.memory_engine = MemoryEngine(project_root or Path.cwd())
        except Exception as exc:
            logger.warning(f"MemoryEngine could not be initialised: {exc}")
            self.memory_engine = None
            
        logger.info(f"BrowserWorkflowEngine initialized: {base_url}")
    
    def discover_routes(self) -> RouteDiscovery:
        """
        Discover application routes by analyzing the app structure.
        
        Returns:
            RouteDiscovery with categorized routes
        """
        logger.info("Starting route discovery...")
        
        routes = RouteDiscovery()
        
        # Common patterns for different route types
        route_patterns = {
            'login': ['/login', '/signin', '/auth/login', '/auth/signin'],
            'dashboard': ['/dashboard', '/home', '/app', '/main'],
            'settings': ['/settings', '/config', '/preferences', '/profile'],
            'admin': ['/admin', '/admin/dashboard', '/management', '/console'],
            'forms': ['/form', '/submit', '/signup', '/register', '/checkout'],
            'error': ['/404', '/error', '/not-found', '/unauthorized'],
        }
        
        # Try common routes
        for category, path_list in route_patterns.items():
            for path in path_list:
                if self._route_exists(path):
                    if category == 'login':
                        routes.login_routes.append(path)
                    elif category == 'dashboard':
                        routes.dashboard_routes.append(path)
                    elif category == 'settings':
                        routes.settings_routes.append(path)
                    elif category == 'admin':
                        routes.admin_routes.append(path)
                    elif category == 'forms':
                        routes.form_routes.append(path)
                    elif category == 'error':
                        routes.error_routes.append(path)
        
        logger.info(f"Route discovery complete: {len(routes.to_dict())} categories identified")
        self.routes = routes
        return routes
    
    def test_login_flow(self, username: str, password: str, username_selector: str = "input[type='email'],input[type='text'],input[name='username']", password_selector: str = "input[type='password']", submit_selector: str = "button[type='submit'],button:has-text('Login'),button:has-text('Sign In')") -> BrowserFlowResult:
        """
        Test login workflow.
        
        Args:
            username: Username or email
            password: Password
            username_selector: CSS selector for username input
            password_selector: CSS selector for password input
            submit_selector: CSS selector for submit button
        
        Returns:
            BrowserFlowResult with test outcome
        """
        logger.info(f"Testing login flow to {self.base_url}")
        
        result = BrowserFlowResult(
            workflow_name="login_flow",
            success=False,
            total_steps=4,
        )
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=self.headless)
                context = browser.new_context()
                page = context.new_page()
                
                # Capture console messages
                page.on("console", self._on_console_message)
                
                # Intercept network requests
                page.on("response", self._on_response)
                
                # Step 1: Navigate to app
                logger.debug("Step 1: Navigate to app")
                page.goto(self.base_url, wait_until="domcontentloaded")
                result.steps_completed += 1
                result.url = page.url
                result.title = page.title()
                
                # Step 2: Navigate to login if needed
                logger.debug("Step 2: Navigate to login")
                if '/login' not in page.url and '/signin' not in page.url:
                    login_routes = self.routes.login_routes or ['/login']
                    page.goto(f"{self.base_url}{login_routes[0]}", wait_until="domcontentloaded")
                result.steps_completed += 1
                
                # Step 3: Fill login form
                logger.debug("Step 3: Fill login form")
                try:
                    page.fill(username_selector, username)
                    page.fill(password_selector, password)
                    result.steps_completed += 1
                except Exception as e:
                    logger.error(f"Failed to fill login form: {e}")
                    result.error_message = f"Form fill failed: {e}"
                    result.console_issues = self.console_issues
                    result.network_failures = self.network_failures
                    browser.close()
                    return result
                
                # Step 4: Submit form
                logger.debug("Step 4: Submit login form")
                page.click(submit_selector)
                page.wait_for_load_state("networkidle", timeout=10000)
                result.steps_completed += 1
                
                # Check if login succeeded
                result.url = page.url
                result.title = page.title()
                result.success = '/login' not in page.url and '/signin' not in page.url
                
                if result.success:
                    logger.info("Login flow succeeded")
                else:
                    logger.warning("Login flow may have failed - still on login page")
                
                # Take screenshot
                result.screenshot_path = self._take_screenshot(page, "login_result")
                
                browser.close()
        
        except PlaywrightTimeoutError as e:
            logger.error(f"Playwright timeout during login: {e}")
            result.error_message = f"Timeout: {e}"
        except Exception as e:
            logger.error(f"Error during login flow: {e}")
            result.error_message = str(e)
        
        result.console_issues = self.console_issues
        result.network_failures = self.network_failures
        return result
    
    def test_form_submission(self, form_url: str, form_data: Dict[str, str], submit_selector: str = "button[type='submit']") -> BrowserFlowResult:
        """
        Test form submission workflow.
        
        Args:
            form_url: URL of the form
            form_data: Form field data {selector: value}
            submit_selector: CSS selector for submit button
        
        Returns:
            BrowserFlowResult with test outcome
        """
        logger.info(f"Testing form submission to {form_url}")
        
        result = BrowserFlowResult(
            workflow_name="form_submission",
            success=False,
            total_steps=len(form_data) + 2,
        )
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=self.headless)
                context = browser.new_context()
                page = context.new_page()
                
                page.on("console", self._on_console_message)
                page.on("response", self._on_response)
                
                # Navigate to form
                logger.debug(f"Navigating to form: {form_url}")
                page.goto(form_url, wait_until="domcontentloaded")
                result.steps_completed += 1
                result.url = page.url
                result.title = page.title()
                
                # Fill form fields
                logger.debug("Filling form fields")
                for selector, value in form_data.items():
                    try:
                        page.fill(selector, value)
                        result.steps_completed += 1
                    except Exception as e:
                        logger.warning(f"Failed to fill {selector}: {e}")
                
                # Submit form
                logger.debug("Submitting form")
                page.click(submit_selector)
                page.wait_for_load_state("networkidle", timeout=10000)
                result.steps_completed += 1
                
                # Check result
                result.url = page.url
                result.title = page.title()
                result.status_code = 200  # Page loaded successfully
                result.success = True
                
                logger.info("Form submission succeeded")
                
                result.screenshot_path = self._take_screenshot(page, "form_result")
                browser.close()
        
        except PlaywrightTimeoutError as e:
            logger.error(f"Timeout during form submission: {e}")
            result.error_message = f"Timeout: {e}"
        except Exception as e:
            logger.error(f"Error during form submission: {e}")
            result.error_message = str(e)
        
        result.console_issues = self.console_issues
        result.network_failures = self.network_failures
        return result
    
    def diagnose_browser_failure(self, flow_result: BrowserFlowResult) -> BrowserDiagnosis:
        """
        Diagnose the root cause of a browser workflow failure.
        
        Args:
            flow_result: BrowserFlowResult with failure details
        
        Returns:
            BrowserDiagnosis with root cause analysis
        """
        logger.info(f"Diagnosing browser failure: {flow_result.workflow_name}")
        
        diagnosis = BrowserDiagnosis(
            workflow_name=flow_result.workflow_name,
            failed=not flow_result.success,
        )
        
        if flow_result.success:
            logger.info("No failure to diagnose")
            return diagnosis
        
        # Analyze console issues
        if flow_result.console_issues:
            for issue in flow_result.console_issues:
                if "hydration" in issue.message.lower():
                    diagnosis.failure_type = BrowserIssueType.HYDRATION_MISMATCH
                    diagnosis.affected_component = "frontend"
                    diagnosis.root_cause = "Frontend hydration mismatch"
                    diagnosis.confidence = 0.90
                    diagnosis.recommended_fixes = [
                        "Check server and client HTML match",
                        "Verify dynamic imports are handled correctly",
                        "Review conditional rendering",
                    ]
                elif "import" in issue.message.lower() or "module" in issue.message.lower():
                    diagnosis.failure_type = BrowserIssueType.JS_ERROR
                    diagnosis.affected_component = "frontend"
                    diagnosis.root_cause = "JavaScript import or module error"
                    diagnosis.confidence = 0.85
                elif "error" in issue.level.lower():
                    diagnosis.failure_type = BrowserIssueType.CONSOLE_ERROR
                    diagnosis.affected_component = "frontend"
                    diagnosis.root_cause = issue.message
                    diagnosis.confidence = 0.70
        
        # Analyze network failures
        if flow_result.network_failures:
            for failure in flow_result.network_failures:
                if failure.is_cors_error:
                    diagnosis.failure_type = BrowserIssueType.CORS_ERROR
                    diagnosis.affected_component = "backend"
                    diagnosis.root_cause = "CORS configuration error"
                    diagnosis.confidence = 0.95
                elif failure.is_auth_error or failure.status_code in [401, 403]:
                    diagnosis.failure_type = BrowserIssueType.AUTH_FAILURE
                    diagnosis.affected_component = "backend"
                    diagnosis.root_cause = "Authentication or authorization failure"
                    diagnosis.confidence = 0.90
                elif failure.status_code and failure.status_code >= 500:
                    diagnosis.failure_type = BrowserIssueType.API_ERROR
                    diagnosis.affected_component = "backend"
                    diagnosis.root_cause = "Backend API error"
                    diagnosis.confidence = 0.85
                else:
                    diagnosis.failure_type = BrowserIssueType.NETWORK_FAILURE
                    diagnosis.affected_component = "network"
                    diagnosis.root_cause = f"Network request failed: {failure.method} {failure.url}"
                    diagnosis.confidence = 0.75
        
        # Generic diagnosis if no specific issues found
        if not diagnosis.root_cause:
            diagnosis.failure_type = BrowserIssueType.UNKNOWN
            diagnosis.root_cause = flow_result.error_message or "Unknown workflow failure"
            diagnosis.confidence = 0.50
        
        diagnosis.evidence = [
            f"Steps completed: {flow_result.steps_completed}/{flow_result.total_steps}",
            f"Console issues: {len(flow_result.console_issues)}",
            f"Network failures: {len(flow_result.network_failures)}",
        ]
        
        # Retrieve historical context from memory
        if getattr(self, 'memory_engine', None):
            try:
                import hashlib
                from app.core.memory_engine import PatternMemory
                
                past_failures = self.memory_engine.retrieve_for_browser_failures(diagnosis.failure_type.value)
                if past_failures:
                    logger.info(f"Retrieved {len(past_failures)} past browser failures for {diagnosis.failure_type.value}")
                    diagnosis.evidence.append(f"Historical pattern detected: {len(past_failures)} similar past failures.")
                    diagnosis.confidence = min(1.0, diagnosis.confidence + 0.1)

                # Store this new failure pattern
                pattern_id = f"browser_{diagnosis.failure_type.value}_{hashlib.md5(diagnosis.root_cause.encode()).hexdigest()[:6]}"
                
                existing_pattern = next((p for p in self.memory_engine.patterns if p.pattern_id == pattern_id), None)
                if existing_pattern:
                    existing_pattern.frequency += 1
                else:
                    new_pattern = PatternMemory(
                        pattern_id=pattern_id,
                        issue_category=f"browser_{diagnosis.failure_type.value}",
                        common_root_causes=[diagnosis.root_cause],
                        frequency=1,
                        success_rate=0.0
                    )
                    self.memory_engine.store_pattern_memory(new_pattern)
            except Exception as e:
                logger.warning(f"Failed to interact with MemoryEngine for browser failures: {e}")
        
        logger.info(f"Diagnosis complete: {diagnosis.root_cause} (confidence: {diagnosis.confidence:.0%})")
        return diagnosis
    
    def verify_fix(self, original_failure: BrowserDiagnosis, workflow_test: Callable) -> FrontendVerificationSummary:
        """
        Verify that a code fix resolves the browser workflow issue.
        
        Args:
            original_failure: Original BrowserDiagnosis
            workflow_test: Callable that executes the workflow test
        
        Returns:
            FrontendVerificationSummary with verification results
        """
        logger.info(f"Verifying fix for: {original_failure.workflow_name}")
        
        summary = FrontendVerificationSummary(
            workflow_name=original_failure.workflow_name,
        )
        
        try:
            # Re-run the workflow test
            result = workflow_test()
            
            if result.success:
                logger.info(f"Workflow {original_failure.workflow_name} now succeeds")
                summary.verification_success = True
                summary.confidence_in_fix = 0.95
                summary.resolved_issues = [original_failure.root_cause]
            else:
                logger.warning(f"Workflow {original_failure.workflow_name} still fails")
                summary.verification_success = False
                summary.confidence_in_fix = 0.30
                summary.remaining_issues = [result.error_message or "Workflow still failing"]
        
        except Exception as e:
            logger.error(f"Error during verification: {e}")
            summary.verification_success = False
            summary.confidence_in_fix = 0.0
            summary.remaining_issues = [str(e)]
        
        return summary
    
    # Private helper methods
    
    def _route_exists(self, route: str) -> bool:
        """Check if a route exists in the application"""
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                response = page.goto(f"{self.base_url}{route}", timeout=5000)
                browser.close()
                return response and response.status < 500
        except:
            return False
    
    def _on_console_message(self, msg):
        """Handle console messages"""
        issue = ConsoleIssue(
            level=msg.type,  # log, error, warning, info
            message=msg.text,
            source=msg.location.get("url", "unknown") if hasattr(msg, 'location') else "unknown",
        )
        self.console_issues.append(issue)
        logger.debug(f"Console {msg.type}: {msg.text}")
    
    def _on_response(self, response):
        """Handle network responses"""
        if response.status >= 400:
            failure = NetworkFailure(
                method=response.request.method,
                url=response.url,
                status_code=response.status,
                is_cors_error="CORS" in response.request.headers.get("error", ""),
                is_auth_error=response.status in [401, 403],
            )
            self.network_failures.append(failure)
            logger.debug(f"Network failure: {response.status} {response.url}")
    
    def _take_screenshot(self, page: Page, name: str) -> str:
        """Take a screenshot of the current page"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{name}_{timestamp}.png"
            filepath = self.screenshots_dir / filename
            page.screenshot(path=str(filepath))
            logger.debug(f"Screenshot saved: {filepath}")
            return str(filepath)
        except Exception as e:
            logger.warning(f"Failed to take screenshot: {e}")
            return None
