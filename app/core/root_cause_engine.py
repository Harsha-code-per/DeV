"""
Root Cause Intelligence System for DeV

The diagnostic brain that performs deep analysis before code modifications.

Responsibilities:
- Collect failure signals from multiple sources
- Intelligently classify failures
- Generate ranked root cause hypotheses
- Map supporting and conflicting evidence
- Recommend safe fix strategies
- Provide explainable, auditable diagnosis

This system improves patch quality by ensuring diagnosis is accurate
before code modifications are attempted.

Design Principles:
- Never guess silently
- Show all evidence
- Rank by confidence
- Recommend safest fix first
- Always explainable
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
import re
import json

from app.utils.logger import setup_logger
from app.tools.terminal import SafeTerminalExecutor


logger = setup_logger(__name__)


class FailureCategory(str, Enum):
    """Classification of failure types"""
    BUILD_FAILURE = "build_failure"
    TEST_FAILURE = "test_failure"
    LINT_FAILURE = "lint_failure"
    TYPE_CHECK_FAILURE = "type_check_failure"
    RUNTIME_ERROR = "runtime_error"
    IMPORT_ERROR = "import_error"
    DEPENDENCY_ISSUE = "dependency_issue"
    CONFIG_ERROR = "config_error"
    ENVIRONMENT_VARIABLE_MISSING = "environment_variable_missing"
    DATABASE_ERROR = "database_error"
    API_ERROR = "api_error"
    AUTH_ERROR = "auth_error"
    FRONTEND_HYDRATION = "frontend_hydration"
    FRONTEND_NAVIGATION = "frontend_navigation"
    FRONTEND_JS_ERROR = "frontend_js_error"
    BROWSER_VALIDATION_FAILURE = "browser_validation_failure"
    GIT_CONFLICT = "git_conflict"
    DEPLOYMENT_CONFIG = "deployment_config"
    SYNTAX_ERROR = "syntax_error"
    UNKNOWN = "unknown"


class SeverityLevel(str, Enum):
    """Severity of the failure"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class FailureSignal:
    """Individual failure indicator"""
    signal_type: str  # "build_error", "test_failure", "stack_trace", etc.
    content: str  # The actual error message or log content
    source: str  # Where it came from (build, test, browser, etc.)
    timestamp: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "signal_type": self.signal_type,
            "source": self.source,
            "content": self.content[:200],  # Truncate for display
            "timestamp": self.timestamp,
        }


@dataclass
class RootCauseHypothesis:
    """Potential root cause with confidence score"""
    hypothesis: str  # The proposed root cause
    category: FailureCategory
    confidence: float  # 0.0 to 1.0
    supporting_evidence: List[str] = field(default_factory=list)
    conflicting_evidence: List[str] = field(default_factory=list)
    affected_files: List[str] = field(default_factory=list)
    verification_approach: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "hypothesis": self.hypothesis,
            "category": self.category.value,
            "confidence": round(self.confidence, 2),
            "supporting_evidence": self.supporting_evidence[:3],
            "conflicting_evidence": self.conflicting_evidence[:2],
            "affected_files": self.affected_files[:5],
        }


@dataclass
class FixRecommendation:
    """Recommended fix strategy"""
    priority: int  # 1 = try first, 2 = try second, etc.
    recommendation: str  # Description of fix
    risk_level: str  # "low", "medium", "high"
    verification_steps: List[str] = field(default_factory=list)
    affected_files: List[str] = field(default_factory=list)
    fallback_recommendation: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "priority": self.priority,
            "recommendation": self.recommendation,
            "risk_level": self.risk_level,
            "verification_steps": self.verification_steps[:3],
            "affected_files": self.affected_files[:5],
            "fallback": self.fallback_recommendation,
        }


@dataclass
class RootCauseAnalysis:
    """Complete root cause analysis output"""
    task_description: str
    failure_category: FailureCategory
    severity: SeverityLevel
    hypotheses: List[RootCauseHypothesis] = field(default_factory=list)
    recommendations: List[FixRecommendation] = field(default_factory=list)
    confidence_in_diagnosis: float = 0.0  # 0.0 to 1.0
    raw_signals: List[FailureSignal] = field(default_factory=list)
    summary: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "task": self.task_description,
            "category": self.failure_category.value,
            "severity": self.severity.value,
            "diagnosis_confidence": round(self.confidence_in_diagnosis, 2),
            "top_hypothesis": self.hypotheses[0].to_dict() if self.hypotheses else None,
            "hypotheses_count": len(self.hypotheses),
            "recommendations": [r.to_dict() for r in self.recommendations[:3]],
            "summary": self.summary,
        }


class RootCauseEngine:
    """
    Production-grade root cause analysis system.
    
    Performs deep diagnosis before code modifications to ensure patch quality.
    """
    
    def __init__(self, repo_path: Path, terminal_executor: Optional[SafeTerminalExecutor] = None):
        """Initialize the root cause engine"""
        self.repo_path = Path(repo_path)
        self.terminal_executor = terminal_executor or SafeTerminalExecutor()
        
        try:
            from app.core.memory_engine import MemoryEngine
            self.memory_engine = MemoryEngine(self.repo_path)
        except Exception as exc:
            logger.warning(f"MemoryEngine could not be initialised: {exc}")
            self.memory_engine = None
            
        logger.info(f"RootCauseEngine initialized for: {repo_path}")
    
    def analyze(self, task: str, failure_signals: List[FailureSignal]) -> RootCauseAnalysis:
        """
        Perform complete root cause analysis.
        
        Args:
            task: Task description that failed
            failure_signals: List of failure indicators from the system
        
        Returns:
            RootCauseAnalysis with ranked hypotheses and recommendations
        """
        logger.info(f"Starting root cause analysis for: {task}")
        logger.debug(f"Processing {len(failure_signals)} failure signals")
        
        # Step 1: Classify the failure
        category, severity = self._classify_failures(failure_signals)
        logger.debug(f"Classified as: {category.value} (severity: {severity.value})")
        
        # Retrieve historical context
        historical_fixes = []
        if getattr(self, 'memory_engine', None):
            try:
                query = task + " " + " ".join([s.content for s in failure_signals])
                historical_fixes = self.memory_engine.retrieve_for_root_cause_analysis(query)
                logger.info(f"Found {len(historical_fixes)} historical fixes for context")
            except Exception as e:
                logger.warning(f"Failed to retrieve memory context: {e}")

        # Step 2: Generate hypotheses
        hypotheses = self._generate_hypotheses(task, category, failure_signals, historical_fixes=historical_fixes)
        logger.info(f"Generated {len(hypotheses)} hypotheses")
        
        # Step 3: Rank hypotheses by confidence
        ranked_hypotheses = sorted(hypotheses, key=lambda h: h.confidence, reverse=True)
        
        # Step 4: Generate recommendations
        recommendations = self._generate_recommendations(ranked_hypotheses)
        logger.info(f"Generated {len(recommendations)} fix recommendations")
        
        # Step 5: Calculate overall diagnosis confidence
        diagnosis_confidence = self._calculate_confidence(ranked_hypotheses, failure_signals)
        
        # Step 6: Create summary
        summary = self._create_summary(ranked_hypotheses, category)
        
        analysis = RootCauseAnalysis(
            task_description=task,
            failure_category=category,
            severity=severity,
            hypotheses=ranked_hypotheses,
            recommendations=recommendations,
            confidence_in_diagnosis=diagnosis_confidence,
            raw_signals=failure_signals,
            summary=summary,
        )
        
        logger.info(f"Analysis complete: confidence={diagnosis_confidence:.2f}, top_hypothesis={ranked_hypotheses[0].hypothesis if ranked_hypotheses else 'None'}")
        return analysis
    
    # Private methods
    
    def _classify_failures(self, signals: List[FailureSignal]) -> Tuple[FailureCategory, SeverityLevel]:
        """Classify failure signals into category and severity"""
        if not signals:
            return FailureCategory.UNKNOWN, SeverityLevel.LOW
        
        content_lower = " ".join([s.content.lower() for s in signals])
        
        # Check for specific patterns (order matters - check most specific first)
        if any(x in content_lower for x in ["syntax error", "syntaxerror"]):
            return FailureCategory.SYNTAX_ERROR, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["build fail", "compilation error", "compile fail"]):
            return FailureCategory.BUILD_FAILURE, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["test fail", "assertion", "pytest", "failed test"]):
            return FailureCategory.TEST_FAILURE, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["import error", "modulenotfound", "cannot find", "no module"]):
            return FailureCategory.IMPORT_ERROR, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["typeerror", "type check", "type mismatch"]):
            return FailureCategory.TYPE_CHECK_FAILURE, SeverityLevel.MEDIUM
        elif any(x in content_lower for x in ["traceback", "exception", "error:", "traceback"]):
            return FailureCategory.RUNTIME_ERROR, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["hydration", "hydration mismatch"]):
            return FailureCategory.FRONTEND_HYDRATION, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["database", "postgres", "mysql", "sql"]):
            return FailureCategory.DATABASE_ERROR, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["lint", "linting", "eslint"]):
            return FailureCategory.LINT_FAILURE, SeverityLevel.MEDIUM
        elif any(x in content_lower for x in ["env", "environment variable", "missing env"]):
            return FailureCategory.ENVIRONMENT_VARIABLE_MISSING, SeverityLevel.HIGH
        elif any(x in content_lower for x in ["dependency", "version", "package"]):
            return FailureCategory.DEPENDENCY_ISSUE, SeverityLevel.HIGH
        
        return FailureCategory.UNKNOWN, SeverityLevel.MEDIUM
    
    def _generate_hypotheses(
        self,
        task: str,
        category: FailureCategory,
        signals: List[FailureSignal],
        historical_fixes: Optional[List[Any]] = None,
    ) -> List[RootCauseHypothesis]:
        """Generate root cause hypotheses based on failure signals"""
        hypotheses = []
        historical_fixes = historical_fixes or []
        
        # If we have historical fixes, use the highest confidence one as a hypothesis
        for fix in historical_fixes[:2]:
            hypotheses.append(RootCauseHypothesis(
                hypothesis=f"Historical issue recurring: {fix.root_cause}",
                category=category,
                confidence=min(0.95, (fix.confidence / 100.0) + 0.1) if hasattr(fix, 'confidence') else 0.8,
                supporting_evidence=[f"Previous fix found: {fix.solution}"],
                verification_approach="Check if previous fix was reverted or incomplete",
            ))
        
        content_lower = " ".join([s.content.lower() for s in signals])
        
        # Hypothesis generation based on category
        if category == FailureCategory.IMPORT_ERROR:
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Missing or incorrect import path",
                category=category,
                confidence=0.85,
                supporting_evidence=["ModuleNotFoundError or ImportError in logs"],
                affected_files=self._extract_file_paths(content_lower),
                verification_approach="Run Python import checks",
            ))
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Circular import dependency",
                category=category,
                confidence=0.60,
                supporting_evidence=["Multiple import attempts or dependency cycle"],
                verification_approach="Trace import order",
            ))
        
        elif category == FailureCategory.BUILD_FAILURE:
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Missing build dependency or tool",
                category=category,
                confidence=0.75,
                supporting_evidence=["Build tool not found in output"],
                verification_approach="Check build tool is installed",
            ))
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Build configuration error",
                category=category,
                confidence=0.70,
                supporting_evidence=["Configuration file issue indicated"],
                verification_approach="Validate build config files",
            ))
        
        elif category == FailureCategory.TEST_FAILURE:
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Failing test case",
                category=category,
                confidence=0.80,
                supporting_evidence=["Test assertion failure"],
                verification_approach="Re-run specific test",
            ))
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Test setup/teardown issue",
                category=category,
                confidence=0.65,
                supporting_evidence=["Test fixture or setup problem"],
                verification_approach="Check test setup",
            ))
        
        elif category == FailureCategory.RUNTIME_ERROR:
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Logic error in code",
                category=category,
                confidence=0.70,
                supporting_evidence=["Stack trace indicates specific function"],
                affected_files=self._extract_file_paths(content_lower),
                verification_approach="Inspect failing function logic",
            ))
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Missing or null variable/object",
                category=category,
                confidence=0.75,
                supporting_evidence=["NullPointerException or AttributeError"],
                verification_approach="Add null checks",
            ))
        
        elif category == FailureCategory.FRONTEND_HYDRATION:
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Frontend and server HTML mismatch during hydration",
                category=category,
                confidence=0.90,
                supporting_evidence=["Hydration mismatch error"],
                verification_approach="Check SSR/CSR output",
            ))
            hypotheses.append(RootCauseHypothesis(
                hypothesis="Missing or extra HTML elements between server and client",
                category=category,
                confidence=0.80,
                supporting_evidence=["Element count or structure mismatch"],
                verification_approach="Compare DOM between server and client",
            ))
        
        # Generic hypotheses for any failure
        if not hypotheses:
            hypotheses.append(RootCauseHypothesis(
                hypothesis="System misconfiguration or missing dependency",
                category=category,
                confidence=0.50,
                supporting_evidence=["Generic failure pattern"],
                verification_approach="Review system setup",
            ))
        
        return hypotheses
    
    def _generate_recommendations(self, hypotheses: List[RootCauseHypothesis]) -> List[FixRecommendation]:
        """Generate fix recommendations based on hypotheses"""
        recommendations = []
        
        # Group recommendations by hypothesis
        for i, hypothesis in enumerate(hypotheses[:3], 1):  # Top 3 hypotheses
            recommendation = self._recommendation_for_hypothesis(hypothesis, i)
            if recommendation:
                recommendations.append(recommendation)
        
        return recommendations
    
    def _recommendation_for_hypothesis(
        self,
        hypothesis: RootCauseHypothesis,
        priority: int,
    ) -> Optional[FixRecommendation]:
        """Generate specific recommendation for a hypothesis"""
        
        if "import" in hypothesis.hypothesis.lower():
            return FixRecommendation(
                priority=priority,
                recommendation="Fix import path or resolve circular dependency",
                risk_level="low",
                verification_steps=["Run import checks", "Test module loads"],
                affected_files=hypothesis.affected_files,
            )
        elif "dependency" in hypothesis.hypothesis.lower():
            return FixRecommendation(
                priority=priority,
                recommendation="Install missing or update dependency version",
                risk_level="medium",
                verification_steps=["Install dependency", "Re-run build", "Verify version compatibility"],
                affected_files=["package.json", "requirements.txt", "Cargo.toml"],
            )
        elif "test" in hypothesis.hypothesis.lower():
            return FixRecommendation(
                priority=priority,
                recommendation="Fix failing test case or test setup",
                risk_level="low",
                verification_steps=["Run specific test", "Verify assertions"],
            )
        elif "hydration" in hypothesis.hypothesis.lower():
            return FixRecommendation(
                priority=priority,
                recommendation="Sync server and client rendering output",
                risk_level="medium",
                verification_steps=["Check SSR output", "Verify client HTML matches", "Test hydration"],
            )
        else:
            return FixRecommendation(
                priority=priority,
                recommendation=f"Address: {hypothesis.hypothesis}",
                risk_level="medium",
                verification_steps=hypothesis.verification_approach.split() if hypothesis.verification_approach else [],
                affected_files=hypothesis.affected_files,
            )
    
    def _calculate_confidence(
        self,
        hypotheses: List[RootCauseHypothesis],
        signals: List[FailureSignal],
    ) -> float:
        """Calculate overall diagnosis confidence"""
        if not hypotheses or not signals:
            return 0.0
        
        # Base confidence on top hypothesis
        top_confidence = hypotheses[0].confidence if hypotheses else 0.0
        
        # Adjust based on signal consistency
        signal_consistency = min(len(signals) / 3, 1.0)  # More signals = more confidence
        
        # Average them
        overall_confidence = (top_confidence * 0.7) + (signal_consistency * 0.3)
        return min(overall_confidence, 1.0)
    
    def _create_summary(
        self,
        hypotheses: List[RootCauseHypothesis],
        category: FailureCategory,
    ) -> str:
        """Create human-readable diagnosis summary"""
        if not hypotheses:
            return f"Unable to determine root cause. Category: {category.value}"
        
        top = hypotheses[0]
        return f"Most likely cause ({top.confidence:.0%} confidence): {top.hypothesis}"
    
    def _extract_file_paths(self, content: str) -> List[str]:
        """Extract file paths from error content"""
        # Simple pattern: look for paths with file extensions
        pattern = r'(\S+\.\w+)'
        matches = re.findall(pattern, content)
        return list(set(matches))[:5]


class DiagnosisCollector:
    """Collects failure signals from multiple sources"""
    
    def __init__(self, terminal_executor: Optional[SafeTerminalExecutor] = None):
        """Initialize collector"""
        self.terminal_executor = terminal_executor or SafeTerminalExecutor()
        logger.info("DiagnosisCollector initialized")
    
    def collect_from_build_failure(self, build_output: str) -> List[FailureSignal]:
        """Collect signals from build failure output"""
        signals = []
        
        for line in build_output.split('\n'):
            if any(x in line.lower() for x in ["error", "fail", "fatal"]):
                signals.append(FailureSignal(
                    signal_type="build_error",
                    content=line,
                    source="build_output",
                ))
        
        return signals
    
    def collect_from_test_failure(self, test_output: str) -> List[FailureSignal]:
        """Collect signals from test failure output"""
        signals = []
        
        for line in test_output.split('\n'):
            if any(x in line.lower() for x in ["failed", "error", "assertion"]):
                signals.append(FailureSignal(
                    signal_type="test_failure",
                    content=line,
                    source="test_output",
                ))
        
        return signals
    
    def collect_from_browser_failure(self, browser_output: Dict[str, Any]) -> List[FailureSignal]:
        """Collect signals from browser validation failures"""
        signals = []
        
        if browser_output.get("errors"):
            for error in browser_output["errors"]:
                signals.append(FailureSignal(
                    signal_type="browser_error",
                    content=error.get("message", "Unknown browser error"),
                    source="browser_validation",
                    context={"error_type": error.get("type", "unknown")},
                ))
        
        if browser_output.get("console_errors"):
            for error in browser_output["console_errors"]:
                signals.append(FailureSignal(
                    signal_type="console_error",
                    content=error,
                    source="browser_console",
                ))
        
        return signals
    
    def collect_from_logs(self, log_content: str) -> List[FailureSignal]:
        """Collect signals from log files"""
        signals = []
        
        for line in log_content.split('\n'):
            if any(x in line.lower() for x in ["error", "exception", "traceback"]):
                signals.append(FailureSignal(
                    signal_type="log_error",
                    content=line,
                    source="logs",
                ))
        
        return signals
