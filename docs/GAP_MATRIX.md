# Gap matrix: DeV vs Claude Code vs Codex

Columns: ✅ has it · 🟡 partial · ❌ missing.

Sources:
- **DeV**: what the engine source contains today (`packages/devcode/src`); updated 2026-10-29.
- **Codex**: its open-source tree (`openai/codex`, Apache-2.0).
- **Claude Code**: public docs and observed behaviour only. It is proprietary and we don't reverse-engineer it.

| Feature | Claude Code | Codex | DeV today | How DeV closes it | Phase |
|---|---|---|---|---|---|
| Free models with automatic failover | ❌ | 🟡 ollama/lmstudio | ✅ `auto/free` | Tune ranking; add a free-tier catalog snapshot | P1.5 |
| Plan mode | ✅ | ✅ | ✅ plan tool | (none) | (done) |
| Subagents | ✅ | ✅ agent-roles | ✅ task tool | Ship wshobson/agents in the catalog | P1.5 |
| Skills | ✅ | ✅ | ✅ | superpowers built in; more via catalog | P1.5 |
| Plugins and marketplace | ✅ | ✅ core-plugins | ✅ catalog, `/plugins`, user and project scope, agent installs on demand | Catalog auto-update; more entries | P1.5 |
| MCP | ✅ | ✅ | ✅ starts on first call, stops when idle | One shared server hub per machine for all agents | P1.5 |
| Undo/rewind (checkpoints) | ✅ | 🟡 | ✅ snapshots, undo/redo, `/rewind` | (none) | (done) |
| Permission modes (default, accept edits, plan, auto) | ✅ | ✅ | ✅ Shift+Tab, `--permission-mode`, safe defaults | (none) | (done) |
| Headless mode | ✅ `-p` | ✅ `exec` | ✅ `dev -p`, JSON output, GitHub Action | (none) | (done) |
| Keep working toward a goal | ❌ | ❌ | ✅ `/goal` with an independent reviewer | (none) | (done) |
| Use other agents' subscriptions | ❌ | ❌ | ✅ hand-off to installed Claude Code, Codex, Gemini CLI | (none) | (done) |
| Status line | ✅ | 🟡 | ✅ tui.json `status_line` | Output styles | M1 |
| Auto-compaction | ✅ | ✅ | ✅ | (none) | (done) |
| `/review` | ✅ | ✅ | ✅ review template | (none) | (done) |
| Git worktrees | ✅ | ✅ | ✅ `/worktree` | (none) | (done) |
| Shell hooks configured by the user | ✅ settings hooks | ✅ `hooks` crate | ✅ dev.json `hooks` in Claude Code's shape (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart) | (done) | (done) |
| Persistent memory | ✅ memory files | ✅ `memories` read/write | ✅ DEV.md (user, project, folder), `#` notes, `/memory` | Cross-project memory with privacy controls | M1 |
| OS sandbox for commands | ✅ | ✅ bwrap, execpolicy | ✅ sandbox-runtime (Linux, macOS), auto-allow inside, asks to leave, dev.json settings | Windows; local MCP servers | M0.3 |
| Background tasks | ✅ | ✅ cloud-tasks | ✅ background subagents | Daemon jobs via `dev serve` | M4 |
| Scheduled / recurring runs | ✅ routines | ❌ | ❌ | Daemon scheduler: morning brief, release radar | P2 |
| Always-on daemon and popup | ❌ | 🟡 app-server-daemon | 🟡 `app/os_presence` (Python) | Evaluate OpenClaw or Hermes vs our popup; talk to `dev serve` | P2 |
| Browser control | ✅ Chrome extension | ❌ | ✅ chrome-devtools-mcp (opt-in) | Add browser-use for autonomous browsing | P2 |
| Computer use (desktop) | ✅ | ❌ | ❌ | cua or UI-TARS | P2 |
| **Voice mode** | ✅ | ✅ voice-host (WebRTC to a remote realtime API) | ❌ | Local and free: openWakeWord, whisper.cpp, text into `dev serve`, Piper TTS | P3 |
| Onboarding / personalisation | 🟡 `/init` | 🟡 | 🟡 `/init` (initialize template) | Interview, then profile and provider setup | P4 |
| Auto-update | ✅ | ✅ | ✅ `devcode upgrade` from DeV's releases, checksum-verified | Catalog auto-update | M1 |
| Low-RAM device profile | ❌ | ❌ | ❌ | Lazy MCPs, no local models under 8 GB, chosen at onboarding | P1.5 / P4 |

## Measured baseline (2026-10-28, Linux x64, 15 GB RAM)

- Input tokens per request: **~20K** (code mode plus ponytail), down from ~107K with every MCP tool sent individually.
- `dev run "…"` peak memory: **~760 MB** with all bundled MCPs configured, since they start on demand. It was 1.8 GB when they started eagerly. A prompt that actually uses REA peaks around 1.6 GB while REA runs.
- The engine's own typecheck needs about 6 GB; run it through `scripts/capped 6G`.
