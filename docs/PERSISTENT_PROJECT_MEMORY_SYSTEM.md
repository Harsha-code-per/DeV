# Persistent Project Memory System

## Overview

The Production-Grade Persistent Project Memory System is the foundational intelligence layer that transforms DeV from a stateless AI tool into a personalized, context-aware "senior engineer." It enables DeV to remember, retrieve, and apply project-specific engineering knowledge across sessions.

**Philosophy**: Retrieval-first, trust-first, and project-aware. DeV must consult its memory before making architectural decisions, planning implementations, or diagnosing failures.

## Architecture

### System Components

```text
User Task / Pipeline Event
          ↓
[Memory Retrieval Engine]
(Semantic tag matching, keyword overlap, recency)
          ↓
   [Scoring & Ranking]
(Boost verified fixes, decay old memory)
          ↓
   [Safety Filter]
(Block secrets, credentials, tokens)
          ↓
[Context Summary Generation]
(Aggregated project, fix, and pattern memory)
          ↓
[Execution / Root Cause / Browser Engines]
```

### Storage Layer

Memory is persisted to a local, human-readable directory (`.dev_memory/`) at the project root. It uses a mix of JSON and JSONL to support fast appending, safe updates, and human auditability.

- `project_memory.json`: Core architectural decisions, tech stack, and deployment commands.
- `fixes.jsonl`: Append-only log of historical fixes, root causes, and verification outcomes.
- `preferences.json`: User coding styles, testing strategies, and tool preferences.
- `patterns.jsonl`: Append-only log of recurring failures (e.g., browser login loops) and success rates.
- `session.json`: Active task state, allowing DeV to resume work after a CLI restart.

## Core Memory Types

The system relies on heavily typed, production-grade data models (not weak dictionaries) to ensure strict schema adherence:

1. **ProjectMemory**: Architecture summaries, stack decisions (e.g., FastAPI + PostgreSQL), deployment expectations, build/test commands, and project constraints.
2. **FixMemory**: Historical fixes mapping a `root_cause` to a successful `solution`. Tracks files changed, verification status, and confidence scores.
3. **PreferenceMemory**: Code style (PEP8, Airbnb), architecture patterns (Service layer), testing preferences, and safety rules.
4. **SessionMemory**: Recent engineering context, ongoing active task state, and unfinished work context that survives CLI restarts.
5. **PatternMemory**: Recurring issues over time (e.g., frontend hydration mismatches), tracking frequency and proven solution success rates.

## Retrieval-First Design

DeV enforces a **Retrieval-First** workflow. Before planning or patching, memory is loaded automatically:

1. **Task Injection**: `ExecutionEngine` queries memory with the task description.
2. **Root Cause Context**: `RootCauseEngine` queries historical fixes matching current failure signals to bypass redundant debugging.
3. **Browser Context**: `BrowserWorkflowEngine` looks up previously recorded `PatternMemory` for recurring UI failures.

### Intelligent Scoring & Ranking

Retrieval isn't basic keyword matching. The `MemoryEngine` implements a sophisticated scoring algorithm:
- **Semantic Tag Overlap**: Jaccard similarity between query tags and memory tags.
- **Verification Boost**: Fixes that passed the VerificationEngine get a 1.5x multiplier.
- **Recency Decay**: Memory degrades in relevance over time (e.g., year-old fixes are penalized by 50%).
- **Frequency Boost**: Patterns seen multiple times score higher.

### Deduplication
To prevent memory bloat, `MemoryEngine` calculates tag-overlap ratios (Jaccard similarity). If a new fix shares >40% semantic similarity and identical solutions to an existing fix, it deduplicates and keeps the highest-confidence version.

## Integration Points

### 1. ExecutionEngine
Before creating an AI implementation plan (`plan_patches`), the `ExecutionEngine` retrieves a `MemoryContextSummary`.
*Impact*: DeV plans fixes aligned with established project architecture and avoids violating known project constraints.

### 2. RootCauseEngine
When diagnosing a failure (e.g., a build error), the engine queries memory using the raw error signals.
*Impact*: If DeV previously fixed a "JWT expiry" issue, that historical solution is immediately injected as a high-confidence hypothesis.

### 3. BrowserWorkflowEngine
During Playwright automation, recurring frontend failures (like CORS or Hydration issues) are stored as `PatternMemory`.
*Impact*: If a login flow repeatedly fails due to a missing selector, the system recognizes the pattern and applies previously successful wait conditions or fallback selectors.

## Safety & Trust Model

**Hard Rules Enforced by Code:**
- **Zero Secrets**: A strict regex-based safety filter blocks the storage of passwords, API keys, access tokens, or connection strings. Any memory containing secrets is instantly rejected.
- **No Garbage**: Only high-value, deduplicated engineering memory is stored. Failed assumptions are discarded.
- **Verified Preference**: Fixes that did not pass the native `VerificationEngine` are ranked substantially lower than verified fixes.

## Future Enhancements (Extensibility)

The system is designed with an abstraction layer for **Embeddings**. 
Currently operating on a lightweight, dependency-free Jaccard-similarity algorithm, `app/memory/embeddings.py` acts as a stub for future integration with local Vector databases (like ChromaDB) or sentence-transformers (TF-IDF/Cosine Similarity) to provide deep semantic matching without relying on external API calls.
