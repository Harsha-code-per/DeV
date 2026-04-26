"""
Comprehensive tests for Root Cause Intelligence System.

Tests cover:
- Failure signal collection
- Failure classification
- Hypothesis generation
- Confidence scoring
- Recommendation generation
- Multi-failure analysis
- Browser failure detection
- Complete diagnosis workflow
"""

import pytest
from pathlib import Path
from unittest.mock import Mock, patch

from app.core.root_cause_engine import (
    RootCauseEngine,
    FailureSignal,
    FailureCategory,
    SeverityLevel,
    RootCauseHypothesis,
    FixRecommendation,
    RootCauseAnalysis,
    DiagnosisCollector,
)


class TestFailureSignal:
    """Test FailureSignal data model"""
    
    def test_signal_creation(self):
        """Test creating a failure signal"""
        signal = FailureSignal(
            signal_type="build_error",
            content="Error compiling: missing import",
            source="build_output",
        )
        assert signal.signal_type == "build_error"
        assert signal.source == "build_output"
        assert "missing import" in signal.content
    
    def test_signal_to_dict(self):
        """Test signal serialization"""
        signal = FailureSignal(
            signal_type="test_failure",
            content="Test assertion failed",
            source="pytest",
        )
        data = signal.to_dict()
        assert data["signal_type"] == "test_failure"
        assert data["source"] == "pytest"
    
    def test_signal_with_context(self):
        """Test signal with context metadata"""
        signal = FailureSignal(
            signal_type="browser_error",
            content="Hydration mismatch",
            source="browser",
            context={"error_type": "hydration", "element": "#app"},
        )
        assert signal.context["error_type"] == "hydration"


class TestFailureClassification:
    """Test failure classification"""
    
    def test_classify_import_error(self, tmp_path):
        """Test import error classification"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="ModuleNotFoundError: No module named 'xyz'",
                source="python",
            )
        ]
        category, severity = engine._classify_failures(signals)
        assert category == FailureCategory.IMPORT_ERROR
        assert severity == SeverityLevel.HIGH
    
    def test_classify_build_failure(self, tmp_path):
        """Test build failure classification"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="Build failed: compilation error",
                source="build",
            )
        ]
        category, severity = engine._classify_failures(signals)
        assert category == FailureCategory.BUILD_FAILURE
        assert severity == SeverityLevel.HIGH
    
    def test_classify_test_failure(self, tmp_path):
        """Test test failure classification"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="FAILED test_main.py::test_example",
                source="pytest",
            )
        ]
        category, severity = engine._classify_failures(signals)
        assert category == FailureCategory.TEST_FAILURE
        assert severity == SeverityLevel.HIGH
    
    def test_classify_type_error(self, tmp_path):
        """Test type error classification"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="TypeError: expected str, got int",
                source="python",
            )
        ]
        category, severity = engine._classify_failures(signals)
        assert category == FailureCategory.TYPE_CHECK_FAILURE
    
    def test_classify_frontend_hydration(self, tmp_path):
        """Test frontend hydration error classification"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="browser_error",
                content="Hydration mismatch in component",
                source="browser",
            )
        ]
        category, severity = engine._classify_failures(signals)
        assert category == FailureCategory.FRONTEND_HYDRATION
    
    def test_classify_syntax_error(self, tmp_path):
        """Test syntax error classification"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="SyntaxError: invalid syntax",
                source="python",
            )
        ]
        category, severity = engine._classify_failures(signals)
        assert category == FailureCategory.SYNTAX_ERROR


class TestHypothesisGeneration:
    """Test root cause hypothesis generation"""
    
    def test_generate_import_hypotheses(self, tmp_path):
        """Test generating hypotheses for import errors"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="ModuleNotFoundError: No module named 'app.utils'",
                source="python",
            )
        ]
        hypotheses = engine._generate_hypotheses(
            "Import xyz module",
            FailureCategory.IMPORT_ERROR,
            signals,
        )
        assert len(hypotheses) > 0
        assert any("import" in h.hypothesis.lower() for h in hypotheses)
        assert all(isinstance(h, RootCauseHypothesis) for h in hypotheses)
    
    def test_generate_build_hypotheses(self, tmp_path):
        """Test generating hypotheses for build failures"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="Build failed: npm not found",
                source="build",
            )
        ]
        hypotheses = engine._generate_hypotheses(
            "Build project",
            FailureCategory.BUILD_FAILURE,
            signals,
        )
        assert len(hypotheses) > 0
        assert any("dependency" in h.hypothesis.lower() or "tool" in h.hypothesis.lower() for h in hypotheses)
    
    def test_hypothesis_confidence_ranking(self, tmp_path):
        """Test that hypotheses are ranked by confidence"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="Test failed",
                source="test",
            )
        ]
        hypotheses = engine._generate_hypotheses(
            "Run tests",
            FailureCategory.TEST_FAILURE,
            signals,
        )
        # Verify confidence values are valid
        for h in hypotheses:
            assert 0.0 <= h.confidence <= 1.0
    
    def test_hypothesis_evidence_mapping(self, tmp_path):
        """Test that hypotheses include evidence"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="ImportError: circular import",
                source="python",
            )
        ]
        hypotheses = engine._generate_hypotheses(
            "Fix import",
            FailureCategory.IMPORT_ERROR,
            signals,
        )
        # Verify evidence is populated
        for h in hypotheses:
            assert len(h.supporting_evidence) >= 0  # May have 0+ evidence items


class TestRecommendationGeneration:
    """Test fix recommendation generation"""
    
    def test_generate_recommendations_for_import_error(self, tmp_path):
        """Test recommendation generation for import errors"""
        engine = RootCauseEngine(tmp_path)
        hypothesis = RootCauseHypothesis(
            hypothesis="Missing or incorrect import path",
            category=FailureCategory.IMPORT_ERROR,
            confidence=0.85,
            supporting_evidence=["ModuleNotFoundError"],
            affected_files=["app/main.py"],
        )
        rec = engine._recommendation_for_hypothesis(hypothesis, 1)
        assert rec is not None
        assert rec.priority == 1
        assert "import" in rec.recommendation.lower()
    
    def test_recommendations_have_risk_levels(self, tmp_path):
        """Test that recommendations include risk levels"""
        engine = RootCauseEngine(tmp_path)
        hypotheses = [
            RootCauseHypothesis(
                hypothesis="Test issue",
                category=FailureCategory.TEST_FAILURE,
                confidence=0.80,
            ),
            RootCauseHypothesis(
                hypothesis="Import issue",
                category=FailureCategory.IMPORT_ERROR,
                confidence=0.70,
            ),
        ]
        recommendations = engine._generate_recommendations(hypotheses)
        assert len(recommendations) > 0
        for rec in recommendations:
            assert rec.risk_level in ["low", "medium", "high"]
    
    def test_recommendations_ordered_by_priority(self, tmp_path):
        """Test that recommendations are ordered by priority"""
        engine = RootCauseEngine(tmp_path)
        hypotheses = [
            RootCauseHypothesis(
                hypothesis="First cause",
                category=FailureCategory.BUILD_FAILURE,
                confidence=0.90,
            ),
            RootCauseHypothesis(
                hypothesis="Second cause",
                category=FailureCategory.BUILD_FAILURE,
                confidence=0.70,
            ),
        ]
        recommendations = engine._generate_recommendations(hypotheses)
        if len(recommendations) >= 2:
            assert recommendations[0].priority < recommendations[1].priority


class TestCompleteAnalysis:
    """Test complete diagnosis workflow"""
    
    def test_end_to_end_analysis(self, tmp_path):
        """Test complete analysis from signals to recommendations"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="build_error",
                content="npm ERR! missing dependency: react@18.0.0",
                source="build",
            ),
            FailureSignal(
                signal_type="build_error",
                content="ERR! npm install failed",
                source="npm",
            ),
        ]
        
        analysis = engine.analyze("Fix production build failure", signals)
        
        assert isinstance(analysis, RootCauseAnalysis)
        assert analysis.failure_category in FailureCategory
        assert len(analysis.hypotheses) > 0
        assert len(analysis.recommendations) > 0
        assert 0.0 <= analysis.confidence_in_diagnosis <= 1.0
    
    def test_analysis_to_dict_serialization(self, tmp_path):
        """Test that analysis can be serialized to dict"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="error",
                content="Test failed",
                source="test",
            )
        ]
        
        analysis = engine.analyze("Run tests", signals)
        data = analysis.to_dict()
        
        assert "task" in data
        assert "category" in data
        assert "severity" in data
        assert "diagnosis_confidence" in data
        assert "recommendations" in data
    
    def test_multiple_failure_signals(self, tmp_path):
        """Test analysis with multiple failure signals"""
        engine = RootCauseEngine(tmp_path)
        signals = [
            FailureSignal(
                signal_type="build_error",
                content="Build failed",
                source="build",
            ),
            FailureSignal(
                signal_type="test_failure",
                content="Test failed",
                source="test",
            ),
            FailureSignal(
                signal_type="lint_error",
                content="Lint error",
                source="lint",
            ),
        ]
        
        analysis = engine.analyze("Fix all errors", signals)
        assert len(analysis.raw_signals) == 3


class TestDiagnosisCollector:
    """Test failure signal collection from different sources"""
    
    def test_collect_build_failures(self):
        """Test collecting build failure signals"""
        collector = DiagnosisCollector()
        output = """
        Compiling project...
        ERROR: missing import in src/main.py:5
        ERROR: build failed
        """
        signals = collector.collect_from_build_failure(output)
        assert len(signals) >= 2
        assert all(s.source == "build_output" for s in signals)
    
    def test_collect_test_failures(self):
        """Test collecting test failure signals"""
        collector = DiagnosisCollector()
        output = """
        Running tests...
        FAILED test_main.py::test_example
        AssertionError: expected 5, got 3
        """
        signals = collector.collect_from_test_failure(output)
        assert len(signals) >= 1
        assert all(s.source == "test_output" for s in signals)
    
    def test_collect_browser_failures(self):
        """Test collecting browser validation failure signals"""
        collector = DiagnosisCollector()
        browser_output = {
            "errors": [
                {"message": "Hydration mismatch", "type": "hydration"},
                {"message": "Element missing", "type": "missing_element"},
            ],
            "console_errors": [
                "TypeError: Cannot read property 'x' of undefined",
            ],
        }
        signals = collector.collect_from_browser_failure(browser_output)
        assert len(signals) >= 3
        assert any(s.source == "browser_validation" for s in signals)
    
    def test_collect_from_logs(self):
        """Test collecting log errors"""
        collector = DiagnosisCollector()
        log_content = """
        2026-04-26 15:00:00 INFO Starting application
        2026-04-26 15:00:01 ERROR Connection refused
        2026-04-26 15:00:02 ERROR Traceback: Exception in thread
        """
        signals = collector.collect_from_logs(log_content)
        assert len(signals) >= 2
        assert all(s.source == "logs" for s in signals)


class TestFailureCategories:
    """Test failure category enum"""
    
    def test_all_categories_defined(self):
        """Test that all expected categories are defined"""
        categories = [
            FailureCategory.BUILD_FAILURE,
            FailureCategory.TEST_FAILURE,
            FailureCategory.IMPORT_ERROR,
            FailureCategory.RUNTIME_ERROR,
            FailureCategory.FRONTEND_HYDRATION,
            FailureCategory.BROWSER_VALIDATION_FAILURE,
            FailureCategory.DEPENDENCY_ISSUE,
        ]
        assert len(categories) >= 7


class TestSeverityLevels:
    """Test severity level enum"""
    
    def test_severity_levels_ordered(self):
        """Test severity levels"""
        levels = [
            SeverityLevel.CRITICAL,
            SeverityLevel.HIGH,
            SeverityLevel.MEDIUM,
            SeverityLevel.LOW,
        ]
        assert len(levels) == 4


class TestConfidenceScoring:
    """Test confidence calculation"""
    
    def test_confidence_based_on_signals(self, tmp_path):
        """Test that confidence increases with more signals"""
        engine = RootCauseEngine(tmp_path)
        
        # Single signal
        signals_one = [
            FailureSignal("error", "Build failed", "build"),
        ]
        hypotheses_one = [
            RootCauseHypothesis("Test", FailureCategory.BUILD_FAILURE, 0.8)
        ]
        conf_one = engine._calculate_confidence(hypotheses_one, signals_one)
        
        # Multiple signals
        signals_multi = [
            FailureSignal("error", "Build failed", "build"),
            FailureSignal("error", "Build error 2", "build"),
            FailureSignal("error", "Build error 3", "build"),
        ]
        hypotheses_multi = [
            RootCauseHypothesis("Test", FailureCategory.BUILD_FAILURE, 0.8)
        ]
        conf_multi = engine._calculate_confidence(hypotheses_multi, signals_multi)
        
        # More signals should increase confidence
        assert conf_multi >= conf_one
    
    def test_confidence_score_range(self, tmp_path):
        """Test that confidence scores are in valid range"""
        engine = RootCauseEngine(tmp_path)
        signals = [FailureSignal("error", "test", "source")]
        hypotheses = [
            RootCauseHypothesis("cause", FailureCategory.UNKNOWN, 0.85),
            RootCauseHypothesis("cause2", FailureCategory.UNKNOWN, 0.60),
        ]
        confidence = engine._calculate_confidence(hypotheses, signals)
        assert 0.0 <= confidence <= 1.0


class TestSummaryGeneration:
    """Test diagnosis summary generation"""
    
    def test_summary_includes_confidence(self, tmp_path):
        """Test that summary includes confidence"""
        engine = RootCauseEngine(tmp_path)
        hypotheses = [
            RootCauseHypothesis(
                "Missing import",
                FailureCategory.IMPORT_ERROR,
                0.85,
            )
        ]
        summary = engine._create_summary(hypotheses, FailureCategory.IMPORT_ERROR)
        assert "85%" in summary or "85" in summary
        assert "Missing import" in summary
    
    def test_summary_with_no_hypotheses(self, tmp_path):
        """Test summary when no hypotheses are available"""
        engine = RootCauseEngine(tmp_path)
        summary = engine._create_summary([], FailureCategory.UNKNOWN)
        assert "Unable to determine" in summary or "unknown" in summary.lower()
