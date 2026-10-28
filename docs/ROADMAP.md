# DeV roadmap

This is the single source of truth for what we build and in what order. Every item has a checkbox. Tick it in the commit that finishes it, and add anything new here before working on it.

## What DeV is

DeV is a **product family**, built as one open-source project (MIT), free to use, and working with any model.

| Product | What it is | Install name |
|---|---|---|
| **DeV Code** | The coding agent. It aims to match, then beat, Claude Code at autonomous and reliable development, including on free and open models. | npm `devcode`; commands `devcode` and `dev` |
| **DeV** (app) | Desktop app for Windows, macOS and Linux. Chat and coding in one, growing into an always-on assistant that wakes on its name and can operate the machine. | `dev-ai` |
| **DeV for Chrome** | Browser extension that works with the app and DeV Code. | `dev-ai` |

DeV started as a fork of OpenCode (MIT), so we didn't have to rebuild the engine. It is now an independent project: we ship our own fixes and releases and don't track upstream. The only exception is that we watch OpenCode's security advisories and port relevant security fixes by hand.

### Principles

- **Claude Code is the bar.** Where Claude Code has a behaviour, mode or command that works, DeV Code matches it, then improves on it.
- **Free first.** DeV works out of the box with free and local models. Paid models are optional.
- **Secure by default.** OS-level sandbox and safe permission defaults. Never "run it in Docker to be safe".
- **Light on the machine.** It must never make the computer lag. Heavy pieces load on demand and unload when idle, and builds and tests run memory-capped.
- **Measured, not claimed.** Benchmarks decide parity; CI blocks regressions.

### Release policy

- The repo stays **private until v1.0** (milestone M3) and goes public with a polished first version.
- Only free channels are used until DeV earns money: GitHub Releases, npm, GitHub Pages, our own Homebrew tap and Scoop bucket, and the free Firefox and Edge add-on stores.
- Paid items are listed under M7.

---

## Done so far

- [x] Engine fork with `auto/free` model routing across free providers: cooldowns, a 30s first-response window, context-overflow handling.
- [x] MCP servers start on demand and stop when idle. Code mode cuts input from ~107K to ~20K tokens per request.
- [x] Catalog of skills, plugins and MCP servers, with user and project scope, `/plugins`, and the agent installing what it needs (with permission).
- [x] ponytail and superpowers built in.
- [x] DeV naming for config (`dev.json`, `.dev/`, `DEV_*`), the banner and wordmark, help text, prompts and 60 translations.
- [x] Removed dependence on OpenCode's services: no keyless Zen, no upsells, no share or account features, DeV's own User-Agent.
- [x] Free out of the box: Ollama and LM Studio detected automatically, and clear guidance when nothing is connected.
- [x] Machine stability: serial, memory-capped typecheck (~2.3 GB peak); a capped pre-push hook; `scripts/capped`; earlyoom.
- [x] One standalone monorepo (engine at the root, full history, Python prototype retired); history scanned for secrets (clean); the old GitHub fork archived.

---

## M0 — Foundation: independent, secure, installable

### M0.2 Hard-fork rename

- [ ] `@opencode-ai/*` → `@dev-ai/*` in every `package.json`, import and tsconfig path.
- [ ] `packages/opencode` → `packages/devcode`. The binary installs as `devcode` with `dev` as an alias.
- [ ] Internal `OPENCODE_*` → `DEV_*`. Remove the alias loop and stock mode (`OPENCODE_DISABLE_DEV_DEFAULTS`); tests and snapshots become DeV-native.
- [ ] Rename identifiers: `OpenCode` → `DevCode` (SDK client and namespaces), the TUI theme name, app IDs.
- [ ] `script/brand-check.ts` in CI. "opencode" may appear only in an allowlist: LICENSE/NOTICE, credits, and the OpenCode Zen provider id and its labels.
- [ ] OpenCode Zen is listed honestly in `/connect` as "OpenCode Zen (free models with your Zen key)", with its data-use notes.

### M0.3 Security baseline (Claude Code-grade)

- [ ] Run every shell command and local MCP server inside `@anthropic-ai/sandbox-runtime` (Apache-2.0; bubblewrap on Linux, Seatbelt on macOS, restricted user plus network fence on Windows).
  - Writes only to the project and temp folders.
  - `~/.ssh`, `~/.aws`, `.env*` and the key store are unreadable.
  - Network goes through an allowlist proxy.
- [ ] Safe permission defaults: read in the project; edits ask (or "accept edits" mode); sandboxed shell runs without asking and anything outside the sandbox asks; secrets denied.
- [ ] Server listens on localhost only and generates a random password by default.
- [ ] Web, MCP and file content is marked untrusted; risky actions (deleting outside the project, `git push`, installs) need confirmation.
- [ ] Supply chain: pinned deps, gitleaks and Renovate in CI, npm provenance, SHA-256 checksums on releases.
- [ ] New `SECURITY.md`: threat model, the sandbox, private reporting through GitHub Security Advisories.

### M0.4 Install and update (free channels)

- [ ] Release CI matrix: Linux x64/arm64 (glibc and musl), macOS x64/arm64, Windows x64. GitHub Releases with checksums.
- [ ] `curl -fsSL https://harsha-code-per.github.io/DeV/install | sh` and `install.ps1`, both verifying checksums.
- [ ] `npm i -g devcode`, a Homebrew tap and a Scoop bucket.
- [ ] `devcode upgrade`: download the latest release, verify it, replace the binary.

### M0.5 Project hygiene

- [ ] LICENSE (MIT with OpenCode's and DeV's copyright lines), NOTICE (OpenCode MIT, sandbox-runtime Apache-2.0).
- [ ] CONTRIBUTING (DCO sign-off, `scripts/capped`), CODE_OF_CONDUCT, issue and PR templates.
- [ ] CI on every PR: typecheck, tests, brand check, gitleaks.
- [ ] Rewrite README for the product family.

---

## M1 — DeV Code: match, then beat, Claude Code

### Measure first

- [ ] Benchmark harness (`bench/`): ~30 real tasks (bug fixes, features, refactors, terminal work), each with hidden tests.
  - It runs `devcode`, `claude -p` and `codex exec` on identical copies.
  - It records pass rate, time, tokens and cost, against free models and against one strong model.
- [ ] Benchmark in CI; regressions block merges.

### Claude Code parity: modes and behaviour

- [ ] **Permission modes**, cycled with Shift+Tab:
  - default (ask);
  - accept edits;
  - plan mode (read-only research, then a plan to approve);
  - auto/bypass (opt-in, with a clear warning).
- [ ] **Project memory:** `DEV.md` (like `CLAUDE.md`), loaded hierarchically (user, project, folder). `#` adds a note to memory; `/memory` edits it.
- [ ] **Slash commands with Claude Code's behaviour:** `/init`, `/review`, `/compact`, `/clear`, `/cost`, `/model`, `/permissions`, `/mcp`, `/plugins`, `/resume`, `/rewind`, `/status`, `/config`, `/doctor`, `/bug`.
- [ ] **Hooks** configured by the user (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart) as shell commands in settings.
- [ ] **Subagents:** custom agents in `.dev/agents/`, parallel subagents, and background tasks you can check on.
- [ ] **Checkpoints and rewind** of both code and conversation.
- [ ] **Headless mode** (`devcode -p`), JSON and streaming output, an SDK for scripting, and a GitHub Action.
- [ ] **Status line**, output styles, and `@` file mentions with fuzzy search.
- [ ] **Reliability:**
  - a plan → do → verify loop (run tests and builds before saying "done");
  - automatic retries;
  - long sessions that survive compaction;
  - never hangs (watchdogs on every external call).

### Beyond Claude Code

- [ ] Free-model quality routing: rank `auto/free` candidates by measured success per task type.
- [ ] Persistent memory across sessions and projects, with privacy controls.
- [ ] Catalog auto-update: new skills, plugins and MCP servers, health-checked before switching, with rollback.
- [ ] One shared MCP hub per machine, used by every DeV surface.

---

## M2 — Identity and UX: DeV looks like DeV

Not urgent, but it must be done before v1.0.

- [ ] **Signature colour.** Choose one unique brand colour (as Claude has its coral), check it for contrast in light and dark themes and on common terminals, and define a small palette around it.
- [ ] **Logo and mark** in that colour: SVG mark and wordmark; favicon; app icons for Windows, macOS and Linux (`packages/identity`); TUI wordmark colours.
- [ ] **TUI redesign** so it no longer looks like OpenCode: layout, header and status line, prompt box, message styling, permission dialogs, the splash and home screen. The default theme uses the signature colour.
- [ ] **Web and desktop UI theme** from the same palette; replace OpenCode's SVG wordmark in `packages/ui` and the desktop app.
- [ ] Website and docs styled to match.

---

## M3 — v1.0 public launch (DeV Code)

- [ ] M0 complete, the M1 parity checklist complete, the M2 identity done.
- [ ] Benchmark results published honestly (free and strong models).
- [ ] Website and docs on GitHub Pages: install, quick start, configuration, security, free-model guide, FAQ.
- [ ] Demo video or GIFs; launch post.
- [ ] Make the repo public. Announce, invite contributors, and label good first issues.

---

## M4 — DeV app (desktop: Windows, macOS, Linux)

All surfaces share **one engine and one set of sessions**: start in the app, continue with `dev` in a terminal.

- [ ] Rebrand `packages/desktop` (Electron): name, app ID, icons, our own update feed (GitHub Releases), unsigned builds with first-run steps documented.
- [ ] Chat and coding in one window over the shared engine; the session list syncs with the CLI.
- [ ] Runs in the tray and starts with the system. Idle budget: ≤150 MB RAM and ~0% CPU.
- [ ] Wake on name or hotkey; a popup.
- [ ] **Voice**, local and free:
  - VAD and wake word always on and tiny;
  - whisper.cpp and Piper load only on wake and unload after 60s idle;
  - dictation mode.
- [ ] Computer use: screenshot and input on Wayland/X11, macOS and Windows.
- [ ] Scheduler for repetitive tasks; live web data; notifications.
- [ ] Machine and system control (files, packages, services) through a privileged helper that asks for approval on every privileged action.

## M5 — DeV for Chrome

- [ ] MV3 extension with a side-panel chat; controls your real Chrome through CDP (tabs, read, click, type, screenshots, console, network).
- [ ] Connects to the local engine through native messaging (no open port).
- [ ] Per-site permissions; confirmation for purchases, sending and credentials; page content treated as untrusted.
- [ ] Distributed through GitHub Releases plus the Firefox and Edge add-on stores (free). The Chrome Web Store comes in M7.

## M6 — Personal and for everyone

- [ ] Onboarding interview builds a profile and connects free providers or a local model.
- [ ] Low-RAM profile chosen automatically.
- [ ] Multi-language docs; accessibility.

## M7 — Paid polish (once DeV earns money)

- [ ] Own domain.
- [ ] Apple notarization ($99/yr).
- [ ] Windows code signing.
- [ ] Chrome Web Store ($5).
- [ ] Hosted services if wanted (sync, team features).

---

## Cross-cutting, always

- **Performance budgets:** idle daemon ≤150 MB; ~20K tokens per request; typecheck ≤2.5 GB.
- **Security reviews** for every feature that touches the shell, network or credentials.
- **Privacy:** local-first, nothing leaves the machine without the user knowing.
- **Docs and a changelog** updated in the same PR as each feature.
- See [GAP_MATRIX.md](GAP_MATRIX.md) for feature parity with Claude Code and Codex, and [ECOSYSTEM.md](ECOSYSTEM.md) for the open-source projects we build on.
