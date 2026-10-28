# Elite Conversational CLI — Phase 1 Documentation

## Overview

DeV Elite CLI transforms the user experience from explicit commands to natural conversation. Users type what they want to do, and DeV handles the entire workflow invisibly.

## Phase 1 Components

### 1. Elite Models (`app/cli/elite_models.py`)

**Purpose**: Data structures for CLI workflow

**Key Classes**:
- `TaskSize`: enum (SMALL, MEDIUM, LARGE)
- `TaskType`: enum (BUG_FIX, FEATURE, REFACTOR, OPTIMIZATION, TEST, INVESTIGATION, DEPLOYMENT, UNKNOWN)
- `ApprovalLevel`: enum (LOW, MEDIUM, HIGH, CRITICAL)
- `NaturalTaskRequest`: User task with classification
- `ImplementationPlan`: Markdown plan artifact
- `ApprovalRequest`: Structured approval prompt
- `ExecutionContext`: Full execution context
- `CLIState`: Current CLI state

**Usage Example**:
```python
request = NaturalTaskRequest(
    raw_text="Fix production build failure",
    task_type=TaskType.BUG_FIX,
    task_size=TaskSize.SMALL,
    confidence=0.92
)
```

### 2. Task Classification (`app/cli/task_classifier.py`)

**Purpose**: Classify natural language tasks into type and size

**Algorithm**:
1. Keyword matching for task type (BUG_FIX, FEATURE, etc.)
2. Keyword matching for task size (SMALL vs LARGE)
3. Heuristics for complex tasks (FEATURE → LARGE, BUG_FIX → SMALL)
4. Confidence scoring (0.0-1.0)

**Example Classifications**:
```
"Fix the login bug" → BUG_FIX, SMALL (confidence 0.95)
"Build JWT authentication system" → FEATURE, LARGE (confidence 0.90)
"Explain why database is slow" → INVESTIGATION, SMALL (confidence 0.88)
"Refactor authentication service" → REFACTOR, MEDIUM (confidence 0.85)
```

**Size Heuristics**:
- SMALL: < 30 minutes, single file, quick fix
- MEDIUM: 30 min - 2 hours, few files, moderate work
- LARGE: > 2 hours, multiple files, system changes

### 3. Dev Folder Manager (`app/cli/dev_manager.py`)

**Purpose**: Manage project-local .dev folder structure

**Structure Created**:
```
project/
├── .dev/
│   ├── plans/              # Implementation plans
│   ├── diffs/              # Generated diffs
│   ├── memory/             # Project memory
│   ├── logs/               # Execution logs
│   ├── sessions/           # Session artifacts
│   ├── checkpoints/        # Savepoints
│   └── browser/            # Browser test results
└── .gitignore (updated)
    /.dev/
```

**Key Methods**:
- `ensure_dev_structure()`: Create structure if missing
- `list_plans()`: List all plans
- `get_latest_plan()`: Get most recent plan
- `get_structure_summary()`: Text summary of structure

### 4. Markdown Plan Builder (`app/cli/plan_builder.py`)

**Purpose**: Generate beautiful, reviewable markdown plans

**Output Format**:
```markdown
# Implementation Plan

**Generated**: 2025-01-15T10:30:00
**Task Type**: bug_fix
**Estimated Time**: 30 minutes

## Task
Fix the authentication token refresh issue

## Diagnosis & Hypothesis
Token not refreshing when it expires. User gets logged out unexpectedly.

## Proposed Solution
### Affected Files
- `app/auth/token_manager.py`
- `tests/auth_test.py`

### Proposed Changes
- Add refresh_token() method
- Implement token expiry check
- Add retry logic

## Risk Analysis
- **May affect existing refresh logic**: Low (wrapped in feature flag)
- **Performance impact**: None

## Verification Steps
- [ ] Unit tests pass
- [ ] Manual login flow test
- [ ] Token expiry scenario test

## Review Checklist
- [ ] Approach seems correct
- [ ] Changes are minimal/focused
- [ ] Ready to execute in sandbox
```

**Key Methods**:
- `build_and_save()`: Generate and save plan
- `read_plan()`: Read existing plan
- `list_recent_plans()`: List N most recent plans

### 5. Command Router (`app/cli/command_router.py`)

**Purpose**: Route user input to appropriate handler

**Commands Supported**:
- `/help` - Show help information
- `/model` - Select model or view current
- `/memory` - Access project memory
- `/doctor` - System diagnostics
- `/daemon` - OS presence daemon control
- `/config` - Configure DeV settings
- `/exit` - Exit CLI
- `/cancel` - Cancel current operation

**Natural Task Routing**:
Routes any non-command input to TaskClassifier

**Example Routing**:
```python
route_type, command, data = router.route("Fix the login issue")
# Returns: ("natural", None, NaturalTaskRequest(...))

route_type, command, data = router.route("/model")
# Returns: ("command", "model", None)
```

### 6. Context Display (`app/cli/context_display.py`)

**Purpose**: Show beautiful context information

**Displays Available**:

1. **Compact Display**:
   ```
   [DeepSeek V4 Flash] [portfolio-site] [feature/auth-fix] [ready]
   ```

2. **Panel Display**:
   ```
   ┌─────────────────────────────────────────────────┐
   │ Model: DeepSeek V4 Flash (DeepSeek)            │
   │ Provider: DeepSeek API                         │
   │ Project: portfolio-site                        │
   │ Branch: feature/auth-fix                       │
   │ Sandbox: dev-1234                              │
   │ Memory: 12 fixes, 3 patterns                   │
   │ Browser: ready                                 │
   └─────────────────────────────────────────────────┘
   ```

3. **Startup Display**:
   ```
   ↳ Memory loaded (12 sessions)
   ↳ Sandbox ready (git worktree)
   ↳ Model active: DeepSeek V4 Flash
   ↳ Project detected: portfolio-site
   ↳ Git branch: feature/auth-fix
   ```

### 7. Startup Experience (`app/cli/startup_experience.py`)

**Purpose**: Create premium, fast startup experience

**Startup Flow**:
1. Show logo animation (instant)
2. Initialize project structure (< 100ms)
3. Load project memory (< 200ms)
4. Initialize sandbox (< 100ms)
5. Detect project info (< 100ms)
6. Display context (instant)
7. Show ready prompt (instant)

**Total Target**: < 2 seconds to first prompt

**Example Output**:
```
╭─ DeV Engineering OS ─────────────────────╮
│                                          │
│  🚀  DeV Elite Engineering System         │
│                                          │
│  The trust-first AI engineering OS       │
│  for production-grade workflows          │
│                                          │
╰──────────────────────────────────────────╯

  Initializing...

  ↳ Project structure      ✓
  ↳ Memory loaded          ✓ (12 patterns)
  ↳ Sandbox ready          ✓ (git worktree)
  ↳ Model active           ✓ (DeepSeek V4 Flash)
  ↳ Project detected       ✓ (portfolio-site)
  ↳ Git branch             ✓ (feature/auth-fix)

↳ Memory loaded (12 sessions)
↳ Sandbox ready (git worktree)
↳ Model active: DeepSeek V4 Flash
↳ Project detected: portfolio-site
↳ Git branch: feature/auth-fix

Ready! (loaded in 1.2s)

Hi Harsha — what are we building today?
> 
```

## Workflow: From Input to Execution

### Small Task Example

```
User: "Fix the login bug"
      ↓
CommandRouter: Not a command, natural task
      ↓
TaskClassifier: BUG_FIX, SMALL, confidence=0.95
      ↓
CLI Decision: Execute immediately
      ↓
ExecutionEngine.execute() with approval
      ↓
Show diff + result
      ↓
"Ready to apply? (yes/no)"
```

### Large Task Example

```
User: "Build JWT authentication system with refresh tokens"
      ↓
CommandRouter: Not a command, natural task
      ↓
TaskClassifier: FEATURE, LARGE, confidence=0.92
      ↓
CLI Decision: Create markdown plan for review
      ↓
PlanBuilder: Generate .dev/plans/jwt-auth.md
      ↓
Display: Show plan to user
      ↓
User reads and edits if needed
      ↓
User: "proceed"
      ↓
ExecutionEngine.execute() with approval
      ↓
Show diff + result
      ↓
"Ready to apply? (yes/no)"
```

## Integration Points

### With ExecutionEngine
- Natural task request → ExecutionEngine.execute()
- Full approval workflow preserved
- All existing engines used

### With MemoryEngine
- Retrieve project patterns before planning
- Store successful fixes after execution
- Improve diagnosis with historical context

### With OS Presence Layer
- Popup can submit tasks to CLI
- Popup context captured
- Unified execution flow

## Testing

### Test Coverage (Phase 1)
```
test_elite_cli_core.py:
├── TestDataModels (6 tests)
├── TestDevFolderManager (5 tests)
├── TestTaskClassifier (8 tests)
├── TestImplementationPlan (1 test)
└── TestExecutionContext (1 test)

Total: 21 tests, all passing ✓
```

### Test Examples

```python
# Task Classification
def test_classify_feature_large():
    classifier = TaskClassifier()
    request = classifier.classify("Build JWT authentication system")
    
    assert request.task_type == TaskType.FEATURE
    assert request.task_size == TaskSize.LARGE

# Dev Folder
def test_ensure_dev_structure():
    manager = DevFolderManager(project_root)
    assert manager.ensure_dev_structure()
    assert (project_root / ".dev" / "plans").exists()

# Plan Generation
def test_plan_save_to_file():
    plan = ImplementationPlan(task_description="Fix JWT issue", ...)
    assert plan.save_to_file(dev_dir)
    assert plan.filename is not None
```

## Design Principles

### 1. Natural First
- Natural language is primary workflow
- Commands are optional, for power users
- No explicit /plan → /execute required

### 2. Trust First
- All execution in sandboxes
- Always requires approval
- Changes visible before applying
- No destructive actions without review

### 3. Beautiful
- Premium startup experience
- Elegant context display
- Professional interaction
- Clear feedback

### 4. Fast
- Classification < 100ms
- Startup < 2 seconds
- Response time < 200ms
- Minimal latency

### 5. Production Quality
- 100% type hints
- Comprehensive tests
- Structured logging
- Clean architecture

## Phase 1.5: Ready for Next

### elite_cli_runner.py (NEXT)
- Main CLI entry point
- Startup orchestration
- Main interaction loop
- Command dispatch

### conversation_engine.py (NEXT)
- Task orchestration
- Memory retrieval
- Plan generation
- ExecutionEngine routing

### interactive_enhanced.py (NEXT)
- Enhanced interactive mode
- @file referencing
- Autocomplete system
- Advanced UX

## Future Phases

### Phase 2: Workflow Enhancement
- @file referencing (e.g., @auth-plan.md)
- Small task express path
- Large task workflow
- Browser workflow native integration
- Advanced approval UX

### Phase 3: Polish & Production
- Autocomplete system
- Error handling + recovery
- Beautiful output formatting
- Full documentation
- Performance optimization

## Architecture Diagram

```
User Input (Natural Language)
         ↓
    CommandRouter
         ↓
    ┌────┴─────┐
    ↓          ↓
Command    Natural Task
    ↓          ↓
Handler    TaskClassifier
               ↓
        ┌──────┴──────┐
        ↓             ↓
     SMALL          LARGE
        ↓             ↓
    Quick Plan   PlanBuilder
        ↓             ↓
        └──────┬──────┘
               ↓
        ExecutionEngine
               ↓
        (approval workflow)
               ↓
         Show Results
```

## Quick Start

### For Users
```bash
# Start CLI
$ dev

# Natural task
> Fix the login bug

# Or use commands
> /help
> /model
> /memory

# Exit
> /exit
```

### For Developers
```python
# Classification
from app.cli.task_classifier import TaskClassifier
classifier = TaskClassifier()
request = classifier.classify("Your task here")

# Dev folder
from app.cli.dev_manager import DevFolderManager
manager = DevFolderManager(Path("."))
manager.ensure_dev_structure()

# Plan generation
from app.cli.plan_builder import MarkdownPlanBuilder
builder = MarkdownPlanBuilder(Path(".dev"))
builder.build_and_save(plan)
```

## Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| elite_models.py | 233 | Core data models |
| task_classifier.py | 280 | Task classification |
| dev_manager.py | 200 | .dev folder management |
| plan_builder.py | 300 | Markdown plan generation |
| command_router.py | 380 | Command routing |
| context_display.py | 250 | Beautiful context display |
| startup_experience.py | 320 | Premium startup |
| test_elite_cli_core.py | 490 | 21 comprehensive tests |

**Total Phase 1**: ~2,450 lines of production code + tests

---

## Next Steps

1. ✅ **Phase 1 Core Infrastructure** (COMPLETE)
   - All 7 core modules built
   - 21 tests passing
   - Ready for Phase 1.5

2. ⏭️ **Phase 1.5: Startup + Integration** (NEXT)
   - Build elite_cli_runner.py
   - Build conversation_engine.py
   - Integrate with ExecutionEngine
   - Add integration tests

3. 🔮 **Phase 2: Workflow Enhancement** (AFTER)
   - @file referencing
   - Small/large task paths
   - Beautiful approval UX
   - Browser workflow native

4. 🎯 **Phase 3: Production Polish** (AFTER)
   - Autocomplete
   - Error handling
   - Performance tuning
   - Full documentation

---

**Status**: Phase 1 complete, production-ready, all tests passing.
