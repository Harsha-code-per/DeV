# Root Cause Intelligence System

## Overview

The Root Cause Intelligence System is the diagnostic brain of DeV that performs deep analysis before code modifications. It transforms raw failure signals into ranked root cause hypotheses with evidence mapping and safe fix recommendations.

**Purpose**: Improve patch quality by ensuring diagnosis is accurate and explainable before code changes are attempted.

**Philosophy**: Never guess silently. Show all evidence. Rank by confidence. Recommend safest fix first.

## Architecture

### Data Flow

```
Failure Signals (Build, Test, Browser, Logs)
           ↓
    Classification Engine
           ↓
    Hypothesis Generator
           ↓
    Confidence Scorer
           ↓
    Evidence Mapper
           ↓
    Fix Recommender
           ↓
  RootCauseAnalysis Output
```

### Core Components

#### 1. Failure Signal Collection

**Module**: `DiagnosisCollector`

Collects failure indicators from multiple sources:
- Build output (compilation errors, tool failures)
- Test results (pytest, unit test failures)
- Browser validation (Playwright errors, hydration mismatches)
- Log files (stack traces, exceptions)
- System errors (dependency issues, environment variables)

```python
from app.core.root_cause_engine import DiagnosisCollector

collector = DiagnosisCollector()

# Collect from build failures
signals = collector.collect_from_build_failure(build_output)

# Collect from test failures
signals = collector.collect_from_test_failure(test_output)

# Collect from browser validation
signals = collector.collect_from_browser_failure(browser_results)

# Collect from logs
signals = collector.collect_from_logs(log_content)
```

**FailureSignal Model**:
```python
@dataclass
class FailureSignal:
    signal_type: str      # "build_error", "test_failure", etc.
    content: str          # The actual error message
    source: str           # Where it came from
    timestamp: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
```

#### 2. Failure Classification

**Supported Categories**:
- `BUILD_FAILURE`: Compilation errors, build tool failures
- `TEST_FAILURE`: Failing test cases
- `LINT_FAILURE`: Linting violations
- `TYPE_CHECK_FAILURE`: Type errors
- `RUNTIME_ERROR`: Runtime exceptions, crashes
- `IMPORT_ERROR`: Module not found, import path issues
- `DEPENDENCY_ISSUE`: Missing or conflicting dependencies
- `CONFIG_ERROR`: Configuration file errors
- `ENVIRONMENT_VARIABLE_MISSING`: Missing environment setup
- `DATABASE_ERROR`: Database connection/query errors
- `API_ERROR`: API call failures
- `AUTH_ERROR`: Authentication/authorization issues
- `FRONTEND_HYDRATION`: Server-client HTML mismatch
- `FRONTEND_NAVIGATION`: Frontend routing failures
- `FRONTEND_JS_ERROR`: Browser JavaScript errors
- `BROWSER_VALIDATION_FAILURE`: Playwright validation failures
- `GIT_CONFLICT`: Git merge conflicts
- `DEPLOYMENT_CONFIG`: Deployment configuration issues
- `SYNTAX_ERROR`: Code syntax errors

**Classification Logic**:
```python
category, severity = engine._classify_failures(signals)
# Returns: (FailureCategory, SeverityLevel)
# SeverityLevel: CRITICAL, HIGH, MEDIUM, LOW
```

#### 3. Multi-Hypothesis Root Cause Analysis

**Module**: `RootCauseEngine._generate_hypotheses()`

Generates multiple ranked hypotheses instead of single guesses:

```python
RootCauseHypothesis:
  - hypothesis: str (the proposed root cause)
  - category: FailureCategory
  - confidence: float (0.0 to 1.0)
  - supporting_evidence: List[str]
  - conflicting_evidence: List[str]
  - affected_files: List[str]
  - verification_approach: str
```

Example analysis:
```
Hypothesis 1: Missing environment variable in production config
Confidence: 85%
Supporting: ["DATABASE_URL not in logs", "Connection refused pattern"]
Conflicting: ["Same error in development"]
Affected Files: [".env.production", "config.py"]
Verify: Check environment setup, re-run with env vars

Hypothesis 2: Wrong import path after refactor
Confidence: 62%
Supporting: ["ModuleNotFoundError in traceback"]
Conflicting: ["Import works in development"]
Affected Files: ["app/main.py", "app/models.py"]
Verify: Run import checks, check path mappings

Hypothesis 3: Dependency version mismatch
Confidence: 41%
Supporting: ["Generic build failure"]
Conflicting: ["Dependencies freshly installed"]
Affected Files: ["requirements.txt", "package.json"]
Verify: Check version constraints, update if needed
```

#### 4. Confidence Scoring

**Confidence Calculation**:
- Base: Top hypothesis confidence (weighted 70%)
- Signal consistency: More signals = higher confidence (weighted 30%)
- Range: 0.0 to 1.0

```python
confidence = (top_hypothesis_confidence * 0.7) + (signal_consistency * 0.3)
```

**Interpretation**:
- 0.85-1.0: Very high confidence (safe to proceed)
- 0.70-0.84: High confidence (proceed with verification)
- 0.50-0.69: Medium confidence (needs more evidence)
- < 0.50: Low confidence (needs manual review)

#### 5. Safe Fix Recommendations

**Module**: `RootCauseEngine._generate_recommendations()`

Recommends fixes ordered by priority and safety:

```python
FixRecommendation:
  - priority: int (1 = try first, 2 = try second, etc.)
  - recommendation: str (description of fix)
  - risk_level: str ("low", "medium", "high")
  - verification_steps: List[str]
  - affected_files: List[str]
  - fallback_recommendation: Optional[str]
```

**Priority Order**:
1. Low-risk fixes (documentation, config, environment)
2. Medium-risk fixes (dependency updates, imports)
3. Higher-risk fixes (logic changes, refactors)

Never recommend aggressive rewrites first.

## Usage

### Basic Usage

```python
from app.core.root_cause_engine import RootCauseEngine, FailureSignal, DiagnosisCollector
from pathlib import Path

# Initialize
engine = RootCauseEngine(Path("/path/to/project"))
collector = DiagnosisCollector()

# Collect signals
build_signals = collector.collect_from_build_failure(build_output)
test_signals = collector.collect_from_test_failure(test_output)
browser_signals = collector.collect_from_browser_failure(browser_results)

all_signals = build_signals + test_signals + browser_signals

# Perform analysis
analysis = engine.analyze(
    task="Fix production build failure",
    failure_signals=all_signals
)

# Inspect results
print(f"Category: {analysis.failure_category.value}")
print(f"Severity: {analysis.severity.value}")
print(f"Diagnosis Confidence: {analysis.confidence_in_diagnosis:.0%}")

for i, hypothesis in enumerate(analysis.hypotheses, 1):
    print(f"\nHypothesis {i} ({hypothesis.confidence:.0%}):")
    print(f"  {hypothesis.hypothesis}")
    print(f"  Supporting: {hypothesis.supporting_evidence}")

for i, rec in enumerate(analysis.recommendations, 1):
    print(f"\nFix {i} (Priority {rec.priority}):")
    print(f"  {rec.recommendation}")
    print(f"  Risk: {rec.risk_level}")
    print(f"  Verify: {rec.verification_steps}")
```

### Integration with PatchEngine

```python
from app.core.patch_engine import PatchEngine

# Get root cause analysis
analysis = engine.analyze(task, signals)

# Pass analysis to PatchEngine
patch_engine = PatchEngine(repo_path)
patch_summary = patch_engine.plan_patches(
    task=task,
    root_cause_analysis=analysis,  # ← New parameter
    context=codebase_context
)

# PatchEngine will use diagnosis to improve patch quality
```

## Safety Model

### Trust-First Design

✓ Never modify code without explicit diagnosis
✓ Always show evidence for hypotheses
✓ Rank hypotheses by confidence
✓ Recommend safest fix first
✓ Require verification before applying
✓ Keep audit trail of all decisions

### Confidence-Driven Actions

| Confidence | Action |
|-----------|--------|
| 85-100% | Proceed with recommended fix |
| 70-84% | Proceed with verification |
| 50-69% | Request additional analysis |
| < 50% | Flag for manual review |

### Error Handling

All components include:
- Try/catch for signal collection
- Fallback to UNKNOWN category
- Default recommendations when confidence is low
- Logging at each decision point

## Performance Characteristics

### Signal Collection
- Build output: O(n) where n = lines in output
- Test failures: O(n)
- Browser errors: O(m) where m = errors
- Log analysis: O(n) where n = log lines

### Hypothesis Generation
- Import errors: 2 hypotheses
- Build failures: 2-3 hypotheses
- Runtime errors: 2 hypotheses
- Frontend errors: 2-3 hypotheses
- Generic: 1 hypothesis

### Analysis Time
- Small signal set (< 10 signals): < 100ms
- Medium signal set (10-100 signals): 100-500ms
- Large signal set (> 100 signals): truncated to top 20

## Extensibility

### Adding New Failure Categories

1. Add enum to `FailureCategory`:
```python
class FailureCategory(str, Enum):
    MY_NEW_CATEGORY = "my_new_category"
```

2. Add classification pattern to `_classify_failures()`:
```python
elif any(x in content_lower for x in ["my pattern"]):
    return FailureCategory.MY_NEW_CATEGORY, SeverityLevel.HIGH
```

3. Add hypothesis generation to `_generate_hypotheses()`:
```python
elif category == FailureCategory.MY_NEW_CATEGORY:
    hypotheses.append(RootCauseHypothesis(...))
```

4. Add recommendation to `_recommendation_for_hypothesis()`:
```python
elif "my pattern" in hypothesis.hypothesis.lower():
    return FixRecommendation(...)
```

5. Add test cases to `tests/test_root_cause_engine.py`

### Custom Failure Signal Sources

```python
# Subclass DiagnosisCollector
class CustomDiagnosisCollector(DiagnosisCollector):
    def collect_from_custom_source(self, output):
        signals = []
        # Custom parsing logic
        signals.append(FailureSignal(
            signal_type="custom_error",
            content=error_msg,
            source="custom_system",
        ))
        return signals

# Use it
collector = CustomDiagnosisCollector()
signals = collector.collect_from_custom_source(output)
```

## Testing

Run comprehensive tests:
```bash
pytest tests/test_root_cause_engine.py -v
```

Test coverage includes:
- Signal creation and serialization (3 tests)
- Classification for 6+ failure types (6 tests)
- Hypothesis generation (4 tests)
- Recommendation generation (3 tests)
- End-to-end analysis (3 tests)
- Signal collection from multiple sources (4 tests)
- Failure categories and severity levels (2 tests)
- Confidence scoring (2 tests)
- Summary generation (2 tests)

**Total**: 29 comprehensive tests, 100% passing

## Data Models

### RootCauseAnalysis (Output)

```python
@dataclass
class RootCauseAnalysis:
    task_description: str
    failure_category: FailureCategory
    severity: SeverityLevel
    hypotheses: List[RootCauseHypothesis]
    recommendations: List[FixRecommendation]
    confidence_in_diagnosis: float  # 0.0 to 1.0
    raw_signals: List[FailureSignal]
    summary: str
    
    def to_dict(self) -> Dict:
        # Serializable representation
```

### Integration Points

The Root Cause Intelligence System integrates with:

1. **ExecutionEngine**: Receives failure signals during verification
2. **PatchEngine**: Provides analysis to improve patch generation
3. **VerificationRetryEngine**: Uses diagnosis to guide retry strategies
4. **CLI**: Displays diagnosis to user
5. **ApprovalSystem**: Informs approval decisions

## Future Enhancements

Potential extensions:

1. **ML-based Confidence**: Train model on historical fixes
2. **Custom Parsers**: Add domain-specific error parsers
3. **Hypothesis Reranking**: Use verification feedback to improve ranking
4. **Automated Fix Search**: Query repositories for similar fixes
5. **Multi-language Support**: Extend beyond Python/JS
6. **Performance Profiling**: Detect performance regression failures
7. **Security Analysis**: Detect security-related failures
8. **Natural Language**: Generate more human-readable summaries

## Architecture Decisions

### Why Multiple Hypotheses?

Single-hypothesis diagnosis is often wrong. Multiple ranked hypotheses:
- Acknowledge uncertainty
- Provide fallback strategies
- Enable retry logic if first fix fails
- Build user trust through transparency

### Why Confidence Scoring?

Confidence levels:
- Inform decision-making
- Guide approval requirements
- Enable automatic vs. manual paths
- Improve over time with feedback

### Why Separate Collectors?

`DiagnosisCollector` separates signal collection from analysis:
- Supports multiple failure sources
- Enables custom signal sources
- Makes testing easier
- Decouples concerns

## Conclusion

The Root Cause Intelligence System is the diagnostic foundation of DeV. By combining multi-source signal collection, intelligent classification, multi-hypothesis analysis, and confidence scoring, it enables trust-first engineering workflows where diagnosis quality drives patch quality.

This system transforms DeV from a code generator into an intelligent engineering assistant that understands problems before fixing them.
