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

- [x] `@opencode-ai/*` → `@dev-ai/*` in every `package.json`, import and tsconfig path. One exception: `Brand.PLUGIN_SDK_PACKAGE` still installs OpenCode's published plugin SDK until `@dev-ai/plugin` is on npm (M0.4).
- [x] `packages/opencode` → `packages/devcode`. The binary installs as `devcode` with `dev` as an alias.
- [x] Internal `OPENCODE_*` → `DEV_*` (Zen keeps its own `OPENCODE_API_KEY`); alias loop removed.
- [x] Remove stock mode; tests and snapshots are DeV-native. Only `DEV_DISABLE_BUNDLED_DEFAULTS` remains, which skips the bundled plugins, MCP servers, local-model detection and auto/free default (used by tests).
- [x] Rename identifiers: `OpenCode` → `DevCode` namespaces, `createOpencodeClient`/`OpencodeClient` → `createDevcodeClient`/`DevcodeClient`, `OpenCodeEvent` → `DevCodeEvent`, `OpenCodeHttpApi` → `DevCodeHttpApi`; generators updated (`httpapi-codegen`, legacy SDK `instance`).
- [x] `packages/app` and `packages/session-ui` use the workspace `@dev-ai/client`; the vendored OpenCode 1.17.13 client is gone. DeV's server answers the app's v1 probe, so the app talks to its legacy routes plus `/api` messages and revert commit; the reducer for OpenCode's newer v2 event names was dropped (DeV emits `session.next.*`).
- [ ] ChatGPT (Codex) and xAI sign-in send `Brand.OAUTH_CLIENT` (still "opencode", the partner name those providers accept, so sign-in keeps working). Register DeV with OpenAI and xAI, then set it to "devcode" in `packages/core/src/brand.ts`.
- [ ] Rename remaining internal names in the web/desktop apps: i18n keys (`provider.connect.opencodeZen.*`, `wsl.onboarding.*Opencode*`), the desktop WSL "install opencode" flow, the `x-opencode-directory` client↔server header, and the TUI theme and app IDs. Do this with the M4 desktop and M2 UI work.
- [x] `script/brand-check.ts`: finds user-visible OpenCode text (quoted sentences, JSX text, prompts, docs, translations); `--check` fails when anything would change. The help-snapshot test asserts no command's help mentions opencode. (Wired into CI with M0.5.)
- [x] OpenCode Zen is listed honestly in `/connect` as "OpenCode Zen (free models with your Zen key)", with what it is, how to get a key, and its data-use note.

### M0.3 Security baseline (Claude Code-grade)

- [x] Shell commands run inside `@anthropic-ai/sandbox-runtime` (Apache-2.0) on Linux (bubblewrap) and macOS (Seatbelt): `packages/devcode/src/sandbox`. Verified end to end on Linux.
  - Writes only to the project, any outside directory approved for the command, temp folders and package caches; `.env` and `.git/hooks` stay read-only.
  - Unreadable: `~/.ssh`, `~/.aws`, `~/.gnupg`, gh/gcloud/kube/docker credentials, `~/.netrc`, `~/.git-credentials`, `~/.npmrc`, `~/.pypirc`, DeV's `auth.json`.
  - Network only through the allowlist proxy (package registries, git hosts).
  - `DEV_DISABLE_SANDBOX=1` turns it off; if it can't start, commands run unsandboxed and that's logged.
- [ ] Sandbox follow-ups (the Linux build now ships `vendor/seccomp` next to the binary, so Unix sockets are blocked): local MCP servers; Windows (restricted user plus network fence); check on macOS in CI.
- [x] Safe permission defaults (bundled config): reading in the project is allowed; file edits and web fetches ask; shell commands ask except a read-only set (ls, pwd, git status/diff/log/show/branch, rg, grep, cat, head, tail, wc, which, echo), and anything with a redirect, `--output` or `--pre` asks even then. Verified end to end per permission mode.
- [x] Sandboxed shell commands run without asking (deny rules still apply); unsandboxed ones and outside directories still ask.
- [x] `sandbox` section in dev.json: `enabled`, `network.allow` (extra hosts), `filesystem.allowWrite`, and `filesystem.allowRead` to unhide a credential such as `~/.npmrc` for a private registry. Verified live.
- [x] Leaving the sandbox, as in Claude Code: when the sandbox blocks a command, DeV tells the agent, which can rerun it with `dangerouslyDisableSandbox`. That always asks the user ("Shell command outside the sandbox"); bundled allow rules don't cover it, an "always" approval does, and auto mode approves it. Verified end to end.
- [x] Server listens on localhost only and generates a random password by default.
- [x] Web pages, web search results and MCP results (also through code mode) reach the model inside `<untrusted_content>` blocks that can't be closed from inside, and the system prompt says to treat them as data. Risky actions are covered by the sandbox: deleting outside the project or pushing with your credentials needs to leave it, which asks.
- [ ] Mark file content from outside the project (and cloned third-party repos) as untrusted too.
- [ ] Supply chain: pinned deps, gitleaks and Renovate in CI, npm provenance, SHA-256 checksums on releases. Workflows, `renovate.json` and `.gitleaksignore` are in; tick after the first green CI run and first release. Needs: the Renovate GitHub app installed, and `NPM_TOKEN` (provenance needs a public repo).
- [x] New `SECURITY.md`: threat model, the sandbox, private reporting through GitHub Security Advisories.

### M0.4 Install and update (free channels)

- [ ] Release CI matrix: Linux x64/arm64 (glibc and musl), macOS x64/arm64, Windows x64. GitHub Releases with checksums.
- [ ] `curl -fsSL https://harsha-code-per.github.io/DeV/install | sh` and `install.ps1`, both verifying checksums.
- [ ] `npm i -g devcode`, a Homebrew tap and a Scoop bucket.
- [ ] `devcode upgrade`: download the latest release, verify it, replace the binary.

### M0.5 Project hygiene

- [x] LICENSE (MIT with OpenCode's and DeV's copyright lines), NOTICE (OpenCode MIT, sandbox-runtime Apache-2.0).
- [x] CONTRIBUTING (DCO sign-off, `scripts/capped`), CODE_OF_CONDUCT, issue and PR templates.
- [x] Fix the 3 `packages/sdk-next` embedded tests that already fail in upstream v1.19.4 (SQLite "unable to open database file"), so CI starts fully green.
- [ ] CI on every PR: typecheck, tests, brand check, gitleaks (`.github/workflows/ci.yml` written; tick after its first green run on GitHub).
- [x] Rewrite README for the product family.

---

## M1 — DeV Code: match, then beat, Claude Code

### Measure first

- [x] Benchmark harness (`bench/`, see its README): 10 real tasks with hidden tests so far; a do-nothing agent fails all of them. First run (2026-10-29): DeV Code on `auto/free` passed 10/10 (21–253 s each, $0).
- [ ] Grow it to ~30 harder tasks (larger multi-file features, real-world repos, terminal work): 10/10 on free models means these don't separate agents yet. Then run `claude` and `codex` on the same set (uses the owner's accounts).
  - It runs `devcode`, `claude -p` and `codex exec` on identical copies.
  - It records pass rate, time, tokens and cost, against free models and against one strong model.
- [ ] Benchmark in CI; regressions block merges.

### Claude Code parity: modes and behaviour

- [x] **Permission modes**, cycled with Shift+Tab: default (ask) → accept edits → plan → auto (approve everything not denied).
  - Auto joins the cycle only after `--auto`/`--yolo`/`--dangerously-skip-permissions`/`--permission-mode auto` or an opt-in from the command palette (with a warning), like Claude Code's bypass mode.
  - `--permission-mode default|accept-edits|auto` for `dev` and `dev run`; the prompt shows the active mode.
  - Becomes meaningful with the M0.3 safe defaults (today most actions are allowed without asking).
- [x] **Project memory:** `DEV.md` (like `CLAUDE.md`), loaded hierarchically (user `~/.config/dev/DEV.md`, project, folders as files are read); AGENTS.md and CLAUDE.md still work. `# note` adds to the project memory, `#~ note` to yours; `/memory` opens it in `$EDITOR`; `/init` writes DEV.md.
- [x] **Slash commands with Claude Code's names:** `/init`, `/review`, `/compact`, `/clear`, `/cost`, `/model`, `/permissions`, `/mcp`, `/plugins`, `/resume`, `/rewind`, `/status`, `/config`, `/doctor` (debug info for now), `/bug`, `/memory`.
- [x] **Hooks** configured by the user (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart) as shell commands in dev.json `hooks`, in Claude Code's documented shape: JSON on stdin, exit 2 blocks with stderr as the reason. Verified end to end.
  - [ ] Follow-ups: exit 2 on Stop (keep working) and SessionStart output as context.
- [x] **Subagents:** custom agents in `.dev/agents/`, parallel subagents, and background subagents (on by default).
- [x] **Checkpoints and rewind** of both code and conversation: `/rewind` picks any earlier message to revert (files and conversation) or fork; `/undo` and `/redo` step.
- [x] **Headless mode:** `dev -p "prompt"` (= `dev run`), `--output-format json|stream-json`, and the JS SDK for scripting.
- [x] A GitHub Action for DeV Code (`github/action.yml`: `uses: Harsha-code-per/DeV/github@main`). Usable once the repo is public and has a release.
- [x] **Status line:** `status_line: { command, interval }` in tui.json, as in Claude Code (JSON on stdin, first line shown under the prompt). `@` file mentions with fuzzy search already exist.
- [ ] Output styles.
- [ ] **Reliability:**
  - [x] a plan → do → verify loop (run tests and builds before saying "done"), asked of every model in the system prompt;
  - automatic retries;
  - long sessions that survive compaction;
  - never hangs (watchdogs on every external call).

### Beyond Claude Code

- [x] **Use your subscriptions safely:** the `external_agent` tool hands a task to the user's own installed Claude Code, Codex or Gemini CLI (offered only when one is installed; asks first; TUI shows "Hand off to …"). Their own login and terms apply; DeV never touches those credentials. Verified end to end with Claude Code.
  - Not built on purpose: signing in to Claude Pro/Max or Google Antigravity inside DeV. Anthropic's terms forbid third-party use of subscription sign-in, and Google suspends accounts that connect Antigravity or Gemini CLI sign-in to third-party tools. Gemini is available through a free Google AI Studio key (part of `auto/free`).

- [ ] Free-model quality routing: rank `auto/free` candidates by measured success per task type.
- [ ] Persistent memory across sessions and projects, with privacy controls.
- [ ] Catalog auto-update: new skills, plugins and MCP servers, health-checked before switching, with rollback.
- [ ] One shared MCP hub per machine, used by every DeV surface.

---

## M2 — Identity and UX: DeV looks like DeV

Not urgent, but it must be done before v1.0.

- [x] **Signature colour: Saffron** `#F2A516` (deep `#9A5F00` for text on light backgrounds), chosen 2026-10-29 from three contrast-checked candidates. Palette: warm neutrals, teal `#4FB8C6`/`#0A6F7C` complement (in the `dev` TUI theme).
- [x] **Logo and mark:** a D with a v in its bowl, ink on saffron (`packages/identity/mark.svg`, rendered by `build.sh` to PNGs and the web favicons); the wordmark's V is saffron in the TUI, CLI and exit screen.
- [ ] Desktop app icons (`packages/desktop/icons`, .icns/.ico) from the same mark, with the M4 desktop rebrand.
- [x] Default TUI theme `dev` in the signature colour.
- [x] **TUI redesign, first pass** (checked on screen): rounded saffron prompt and permission frames; your messages marked with a saffron chevron instead of a bar on a panel; saffron reply marker, main agent, sidebar titles and footer mark; a time-of-day greeting on the home screen; hint row teaches shift+tab modes and # memory.
- [x] TUI redesign, second pass: tool output in a thin rounded frame with a saffron marker; light theme checked on screen (deep saffron stays readable); `/goal` status row. (`script/ansi-to-png.py` turns tmux captures into images.)
- [ ] TUI polish later: sidebar layout, the diff view's empty left column for new files.
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

## Watching OpenCode (hard fork: we port fixes by hand and build features ourselves)

Review OpenCode's releases regularly (`gh release list -R anomalyco/opencode`). Last review: 2026-10-29 (v1.19.5, v2.2.0, v2.2.1).

- [x] Ported #54936 (v1.19.5): a failed TUI worker request answers with an error instead of hanging.
- [x] Ported #59649 (v2.2.1): a 429 that sounds like an overflow (Cerebras) is a rate limit, not a context overflow.
- [x] Built our own `/goal <objective>` (their 2.2.1 idea): keeps working until the goal is verified, with pause/resume/clear and a status row.
- Not applicable: #59934 and #59441 change OpenCode 2's rewritten session runner, which DeV doesn't use.
- [ ] Consider: scheduled prompts (`/schedule`), for the M4 scheduler.
- [ ] Consider: plugin-managed session instructions that don't bust the prompt cache (2.2.0), and per-model prompt-cache TTLs.
- [ ] Consider: an opt-in `image_generate` tool.
- [x] `/goal` reviews with an independent reviewer: when the agent claims GOAL MET, a child session (general agent, edits denied) checks the project with real evidence and its VERDICT decides; NOT MET findings become the next instruction. Verified end to end.
