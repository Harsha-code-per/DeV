# DeV roadmap

DeV is our own product: a personal, always-on assistant that works at every level of the machine (terminal, projects, desktop, browser, system), coding-first. It aims to beat Claude Code and Codex on every task, it's **free out of the box**, and it runs on any model the user chooses. It's built for its author first, then for everyone. The engine started as a fork of OpenCode (MIT) so we didn't have to rebuild from scratch; everything on top of it is DeV.

Status today: the engine fork, `auto/free` model routing, MCP servers that start on demand, the catalog (`/plugins`), ponytail and superpowers built in, and code mode (~20K tokens per request). See [GAP_MATRIX.md](GAP_MATRIX.md) for feature parity and [ECOSYSTEM.md](ECOSYSTEM.md) for the open-source projects we build on.

Tracks run in this order: parity first, because everything else depends on a strong core agent. Every track has a goal that can be measured.

**Design principle: one DeV, every surface, near-zero cost when idle.**
- **One engine, one set of sessions.** A single background `dev serve` (systemd user service) owns sessions, memory, providers and the catalog. Every surface is a *client* of it:
  - `dev` in a terminal or project (the TUI, like Claude Code; it attaches to the running engine, upstream already has `dev attach`);
  - the wake-word or hotkey popup;
  - the Chrome extension;
  - voice.

  Start a task in the popup, continue it with `dev` in the terminal, and the same session, history and memory are there. Sessions already live in one SQLite store (`~/.local/share/dev`); the daemon makes them live and shared rather than per-process.
- **Idle budget**, measured in CI on this laptop: daemon idle ≤ 150 MB RAM and ~0% CPU. Wake-word listening ≤ 2% of one core and ≤ 100 MB.
- **Pay only while in use.** Heavy pieces load on demand and unload when idle: MCP servers (already done), the speech-to-text and text-to-speech models (R4), the browser bridge (R2) and local LLMs (Ollama keeps a model loaded for minutes, then frees it).
- **Never lag the machine.** The daemon runs under a cgroup (`MemoryMax`, low `CPUWeight`, `nice`/`ionice`), the same idea as `scripts/capped`. Any heavy job is killed before it can freeze the desktop.

- **R0 DeV everywhere** (in progress): rename everything users see; remove OpenCode's services (accounts, share, Zen and Go upsells); DeV always identifies as DeV; free out of the box through auto-detected local models and guided free-tier keys.
- **R1 Parity with Claude Code and Codex (first).**
  1. **Benchmark first:** a `bench/` harness with ~30 real tasks (bug fixes, features, refactors, terminal tasks, each with hidden tests). It runs `dev run`, `claude -p` and `codex exec` on identical copies and records pass rate, time, tokens and cost. It runs against free models and against a strong model with a key, so the agent's own quality can be separated from model quality.
  2. **Close the measured gaps:**
     - routing ranked by quality, using per-model success stats from the benchmark and live sessions;
     - a plan → do → verify loop (run the tests before saying "done");
     - user shell hooks (Claude Code-style `settings` hooks);
     - built-in memory;
     - a bubblewrap sandbox for the shell tool;
     - parallel subagents and background tasks;
     - catalog auto-update.
  - *Goal:* **match, then beat** Claude Code and Codex on the suite with the same model, and keep raising the free-tier pass rate. First milestone: parity, within 5% with the same model. Every release after that must improve the score; the benchmark in CI blocks regressions.
  - *Honest note:* on free models DeV can match the features, but not frontier-model intelligence. That gap is shown in the numbers, not hidden.
- **R2 Chrome extension "DeV for Chrome"** (like Claude in Chrome).
  - An MV3 extension with a side-panel chat.
  - It controls your real, logged-in Chrome through `chrome.debugger` (CDP) and content scripts: tabs, navigate, read the page or accessibility tree, click, type, screenshots, console and network.
  - It connects to the local `dev serve` through **native messaging** (no open port). Browser tools are exposed through code mode, following upstream's `plugin-browser` split (the server owns tools and permissions; the extension is only the endpoint).
  - Safety:
    - per-site permissions;
    - explicit confirmation for purchases, payments, sending messages and entering credentials;
    - page content treated as untrusted data (prompt-injection defence).
  - *Done when:* it completes a scripted set of real web tasks end to end.
- **R3 Always-on Jarvis.**
  - The engine runs as a daemon: a systemd user service around `dev serve`, resource-capped as above.
  - `dev` in any terminal attaches to it, falling back to an in-process engine if the daemon isn't running.
  - Popup on the hotkey or on "Hey DeV". Evaluate OpenClaw or Hermes against our own `app/os_presence` for this.
  - *Done when:* a session started in the popup can be continued with `dev` in a terminal and vice versa, and the idle budget holds.
  - Desktop notifications.
  - **A scheduler** for repetitive tasks and briefs (morning brief, release radar, watching folders and mail).
  - **Live web data** through search and fetch tools.
  - **Machine-level control** (files, packages, services, processes) with tiered permissions.
  - **"System or kernel level"** means OS administration (systemd, packages, drivers, kernel parameters, eBPF-based read-only observability) through a privileged helper that asks for approval on every privileged action. Never silent root.
- **R4 Voice: local, free, and quiet when idle.** Yes, local speech models run on our own CPU and GPU, so voice is built in tiers that wake each other up:
  1. **Always on, tiny:**
     - a voice-activity detector (Silero VAD, ~2 MB) passes audio on only while someone is speaking;
     - the wake-word model (openWakeWord, built to run on a Raspberry Pi) runs only on those snippets.
     
     Silence costs almost nothing. Voice can be switched off entirely, and then the microphone is never opened.
  2. **On "Hey DeV" (or the hotkey):** the popup opens, and whisper.cpp loads to transcribe (on the GPU when there is one, `base` or `small` model by RAM). Text goes to the engine like any typed prompt.
  3. **Reply:** Piper speaks it if voice replies are on.
  4. **Unload:** whisper and Piper are freed after 60s without speech. The next wake reloads them in about a second.

  Dictation mode (speech into any text box) uses the same pipeline. *Done when:* the idle budget holds with voice on, and wake-to-text latency is under 1.5s on this laptop.
- **R5 Computer use:** desktop control by screenshot and input on Wayland/Hyprland (wlr protocols, ydotool) and the other operating systems, using cua or UI-TARS models.
- **R6 Personal and for everyone:**
  - an onboarding interview that builds the profile and connects providers;
  - a low-RAM profile;
  - installers and release CI for every target (upstream's build matrix);
  - DeV's own update channel.
- **Cross-cutting in every track:**
  - local-first privacy;
  - one permission model;
  - memory and token budgets (the `scripts/capped`, lazy MCPs and code mode work continues);
  - the benchmark runs in CI so every change is measured.
