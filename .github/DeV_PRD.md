# Product Requirements Document (PRD)

# Project Title

DeV — Personal AI Operating System + Codex-Killer Engineering Agent

---

# 1. Product Vision

DeV is a permanent AI layer that lives inside the computer 24/7 and acts as both:

1. A personal always-available desktop assistant
2. A world-class engineering execution system

This is not a chatbot.
This is not only a coding assistant.
This is not just a terminal tool.

This is a personal AI operating system designed to help across the full engineering spectrum:

- understanding what is happening on screen
- learning from videos, screenshots, and visual content
- solving engineering problems instantly
- building production-grade applications
- writing, reviewing, and testing code
- planning implementations before execution
- verifying all work before final approval
- acting as a trusted technical cofounder

The goal is:

> Build a system trusted more than Codex, Claude Code, Copilot, or any other coding agent for real-world engineering work.

DeV should feel like:

> A permanent senior engineer + technical cofounder + personal assistant living inside the computer.

---

# 2. Problem Statement

Current tools like Codex, Claude Code, GitHub Copilot CLI, Cursor, and similar agents are powerful but incomplete because:

- premium agents and frontier models are expensive
- full dependence on paid subscriptions is unsustainable
- they are not always present across the operating system
- they require too much manual context switching
- they are weak in screenshot and visual understanding
- they do not properly understand videos and screen recordings
- browser testing is often limited or weak
- they do not feel like a persistent assistant
- they are not deeply personalized to one engineer’s workflow
- they often optimize for autonomy instead of trust
- they are often optimized for specific stacks instead of complete engineering workflows

The user needs:

- a global assistant available instantly from anywhere
- a coding agent equal to Codex in engineering quality
- implementation-plan-first workflows
- approval-driven execution instead of blind code changes
- safe sandboxed engineering workflows
- browser testing + verification loops
- screenshot + video understanding
- long-term memory and project awareness
- support for all engineering domains, not just one framework
- a free-first architecture using open models and student-accessible resources

---

# 3. Product Goals

## G1 — Persistent AI Presence

DeV should live inside the system 24/7 and be instantly accessible using a global shortcut.

## G2 — Codex-Level Engineering Agent

DeV must build production-grade software with engineering quality equal to or better than Codex for the user’s workflow.

## G3 — Approval-Driven Development

DeV must always propose implementation plans first and only proceed after approval.

## G4 — Visual + Browser Intelligence

DeV must understand screenshots, videos, UI quality, browser behavior, and real application flows better than standard coding agents.

## G5 — Native Verification + Guardrails

Every engineering action must be safe, verifiable, reviewable, and reversible.

## G6 — Free-First Multimodel System

DeV must work primarily with free/open models first while supporting premium APIs later when available.

## G7 — Provider-Agnostic Architecture

DeV must support local models, API models, premium models, and future custom models.

## G8 — Personal Memory Layer

DeV must remember projects, preferences, workflows, architecture decisions, and repeated engineering patterns.

---

# 4. Cost Strategy

# Free-First Architecture

The entire system must be buildable using free resources first.

Priority order:

1. Open-source/free models
2. Local models
3. Student subscriptions and credits
4. Premium APIs only as optional upgrades

Examples:

- GitHub Student benefits
- free API tiers
- open-source models
- Ollama local models
- self-hosted infrastructure
- local browser automation

DeV must never depend on one paid provider to function.

Premium models are optional upgrades, not core requirements.

This ensures DeV remains personally owned, scalable, and sustainable.

---

# 5. Non-Goals (Phase 1)

The following are intentionally excluded from MVP:

- multi-user SaaS platform
- enterprise team collaboration
- mobile app version
- fully autonomous production deployment
- silent code changes without approval
- enterprise billing systems
- cloud-first hosted architecture

Phase 1 is focused on a single-user local-first elite engineering assistant.

---

# 6. Target User

# Primary User

A serious engineer building across the full engineering spectrum:

- full-stack web applications
- backend systems and APIs
- distributed systems
- machine learning models and AI systems
- data engineering workflows
- DevOps and cloud infrastructure
- automation systems
- CLI tools and developer tooling
- frontend systems and design-heavy applications
- mobile applications
- production-grade enterprise software
- portfolio-grade products
- research prototypes
- platform engineering
- system architecture

The user relies heavily on coding agents for real development work and expects production-grade output, strong architectural judgment, and deep engineering knowledge beyond a single framework or stack.

---

# 7. Core Product Structure

DeV consists of two connected systems:

# System A — DeV OS (Presence Layer)

An always-present assistant across the operating system.

# System B — DeV Engineering Core (Codex-Killer Terminal Agent)

An approval-driven engineering execution engine.

Both systems work together as one product.

---

# 8. Core Features

# Feature Group A — Presence Layer (DeV OS)

## A1. Global Shortcut Activation

Examples:

- Ctrl + Space
- custom hotkey

This should instantly open DeV from anywhere.

## A2. Quick Popup Interface

Instant popup for:

- quick questions
- contextual explanations
- screenshot uploads
- task requests
- coding help
- system assistance

## A3. Screenshot Capture

Automatic/manual capture for:

- screen understanding
- YouTube explanation
- UI analysis
- browser debugging
- error analysis

## A4. Context Awareness

Understand:

- active window
- current app
- browser tab context
- clipboard
- recent activity

## A5. Voice Input/Output (Later)

- speech-to-text
- text-to-speech

This creates the true Jarvis feel.

---

# Feature Group B — Engineering Core

## B1. Repository Understanding

- deep codebase understanding
- dependency awareness
- architecture analysis
- framework detection
- bottleneck detection
- production issue diagnosis

## B2. Implementation Planning Engine

Before coding, DeV must generate:

- implementation strategy
- step-by-step execution plan
- risks
- architectural decisions
- tradeoff analysis

No coding before approval.

## B3. Code Writing + Refactoring

- build new apps
- build new features
- refactor systems
- debug failures
- optimize performance
- improve architecture
- production-ready code generation

## B4. Terminal Execution

- shell commands
- runtime debugging
- logs
- service management
- dependency fixes
- environment validation

## B5. Git Intelligence

- diffs
- branches
- commit strategy
- PR summaries
- rollback suggestions

---

# Feature Group C — Sandbox Execution System

## C1. Git Worktree Sandboxes

All coding tasks must happen inside isolated worktrees first.

Never perform destructive direct edits by default.

## C2. Review Before Apply

Mandatory workflow:

Ask → Analyze → Plan → Approve → Execute → Test → Diff → Review → Final Approval → Apply

This is non-negotiable.

Trust > autonomy.

---

# Feature Group D — Verification Engine (Native)

Every engineering action must end with verification.

## D1. Verification Steps

- lint
- tests
- typecheck
- build validation
- browser testing
- runtime checks
- performance checks
- deployment safety checks

## D2. Retry Loop

Flow:

write → test → fail → fix → rerun

until verified or blocked.

This separates a real engineering agent from a code generator.

---

# Feature Group E — Guardrails System (Native)

Approval required for:

- deleting files
- force push
- production deployment
- DB migrations
- secrets access
- destructive shell commands
- environment changes
- infrastructure changes

Rollback support must always exist.

---

# Feature Group F — Browser Intelligence

## F1. Real Browser Testing

Using Playwright:

- UI testing
- login flow testing
- browser debugging
- QA validation
- regression checks
- interaction testing
- workflow validation

## F2. Frontend + UX Performance Analysis

- animation lag detection
- performance debugging
- render bottlenecks
- layout validation
- UX flow analysis

---

# Feature Group G — Visual Intelligence

## G1. Screenshot Understanding

- UI critique
- design feedback
- browser error screenshots
- architecture diagrams
- whiteboard notes
- design references
- component analysis

## G2. Video Understanding

- bug recordings
- screen recordings
- animation problems
- UX issues
- transition problems
- performance diagnosis

This is a major differentiator beyond Codex.

---

# Feature Group H — Multimodel Router

## H1. Manual Model Selection

Command:

/model

Shows all connected models.

User can manually select models.

## H2. Auto Mode

DeV automatically selects the best model based on task.

## H3. Provider-Agnostic Support

Support:

- local models
- API models
- premium models
- future custom models

Examples:

- DeepSeek
- GLM
- Qwen
- Nemotron
- GPT
- Claude
- Gemini
- Ollama local models

Future-proof by design.

---

# Feature Group I — Memory Layer

## I1. Persistent Memory

Remember:

- project structures
- architecture preferences
- coding standards
- repeated workflows
- deployment habits
- engineering preferences
- user decision patterns

## I2. Context Retrieval

Relevant context should surface automatically.

DeV should become better over time.

---

# 9. User Stories

## Desktop Help

As a user,
I want to press a shortcut while watching YouTube,
so DeV can explain what is happening on screen instantly.

## Coding Workflow

As a developer,
I want DeV to propose an implementation plan before coding,
so I stay in control of engineering decisions.

## Production Debugging

As a developer,
I want DeV to inspect why my production build fails,
so it can diagnose, fix, test, and verify safely.

## UI Quality

As a developer,
I want DeV to analyze screenshots of my product,
so it can explain quality issues and improvements.

## Browser Validation

As a developer,
I want DeV to test applications using a real browser,
so issues are caught before shipping.

---

# 10. Technical Architecture

```text
Global Shortcut / Popup / Screenshot Layer
                ↓
        Context Capture Layer
                ↓
        Planner + Task Classifier
                ↓
          Multimodel Router
                ↓
 ┌──────────────────────────────────┐
 │ Terminal Engine                  │
 │ Browser Agent                    │
 │ Visual Analysis Engine           │
 │ Git + File Operations            │
 │ Memory Retrieval                 │
 │ Verification Engine              │
 │ Guardrails + Approval System     │
 └──────────────────────────────────┘
                ↓
     Sandbox Worktree Execution
                ↓
       Review + Final Approval
                ↓
         Local Project Apply
```

---

# 11. Suggested Tech Stack

## Core Backend

- Python
- uv
- FastAPI
- Pydantic

## Terminal + Execution

- subprocess
- GitPython
- Git worktrees

## Browser

- Playwright

## Models

- DeepSeek
- GLM
- Nemotron
- Qwen
- GPT
- Claude
- Gemini
- local models via Ollama

## Memory

- PostgreSQL
- ChromaDB / Vector DB

## Presence Layer

- local launcher
- global hotkeys
- lightweight popup UI

## Voice (Later)

- Whisper
- ElevenLabs

---

# 12. Success Metrics

## Product Quality

- successful verified task completion rate
- reduction in debugging time
- fewer failed deployments
- fewer manual repetitive tasks

## Trust Metrics

- approval acceptance rate
- rollback frequency
- user confidence score

## UX Metrics

- shortcut-to-answer speed
- screenshot resolution success
- browser testing success rate

## Personal Success Metric

The ultimate metric:

> Would the user stop opening Codex because DeV is trusted more?

If yes, the product succeeds.

---

# 13. Risks

## Major Risks

- overbuilding too early
- weak verification reliability
- unsafe autonomous behavior
- excessive model costs
- poor multimodel routing
- weak memory relevance
- poor UX despite strong backend

## Mitigation

- engine first approach
- sandbox-first workflow
- approval-driven system
- strong verification engine
- provider-agnostic architecture
- phase-based development

---

# 14. Development Phases

## Phase 1 — Core Engine First (Mandatory Foundation)

- terminal execution
- multimodel provider abstraction
- repo understanding
- planning engine
- sandbox worktrees
- verification engine
- guardrails

## Phase 2 — Browser + Visual Intelligence

- Playwright testing
- screenshot analysis
- UI critique
- video understanding

## Phase 3 — Presence Layer

- global shortcut
- popup launcher
- instant screenshot workflow
- context awareness

## Phase 4 — Voice + Advanced Memory

- voice interaction
- improved memory
- proactive workflows

## Phase 5 — Full DeV Experience

- deeper OS integration
- advanced automation
- refined personal assistant behavior

---

# 15. First Milestone

## Target Outcome

User says:

> DeV, inspect my project and tell me why the production build fails.

System should:

- inspect repository
- understand architecture
- generate implementation plan
- request approval
- create sandbox worktree
- diagnose issue
- apply fix
- run tests + build + browser validation
- show diff + summary
- request final approval
- apply changes safely

This is the first true success point.

---

# Final Product Definition

DeV is a personal AI operating system that combines:

- permanent desktop presence
- Codex-level engineering execution
- implementation-plan-first workflows
- sandboxed safe coding
- native verification + guardrails
- browser testing
- visual intelligence
- multimodel routing
- long-term personal memory

into one trusted system.

The project starts with engine-first development.

The core execution engine must be built before UI layers, voice systems, or advanced assistant behaviors.

Reason:

> Good engine > beautiful interface

Without a strong engine, everything else becomes weak.

The goal is not maximum autonomy.

The goal is:

# Maximum Trust + Maximum Engineering Power