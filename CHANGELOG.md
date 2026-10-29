# Changelog

DeV Code's notable changes. DeV started as a fork of OpenCode v1.19.4 (MIT); this file covers what DeV added or changed since then.

## Unreleased (toward v1.0)

### Free and any-model
- `auto/free` routes each request across the free models of every connected provider, with cooldowns, a first-response window, and correct handling of context overflows and rate limits. It learns which free models actually answer and tries those first.
- Local models (Ollama, LM Studio) are detected automatically, and DeV explains how to start when nothing is connected.
- Hand a task to your own installed Claude Code, Codex or Gemini CLI (`external_agent`), so those subscriptions are used through their official tools. DeV never touches their credentials.
- OpenCode Zen is listed honestly and used only with your own Zen key.

### Safety
- Shell commands run in an OS sandbox (Linux bubblewrap, macOS Seatbelt): writes only to the project, credentials hidden, network limited to package registries and git hosts. Commands inside it run without asking; leaving it always asks. Configure it with `sandbox` in dev.json.
- Permission modes as in Claude Code: default, accept edits, plan and auto, cycled with Shift+Tab or set with `--permission-mode`. Safe defaults ask before edits, web fetches and most shell commands.
- The local server is never unauthenticated: a password is generated when none is set.
- Web pages, search results and MCP results reach the model marked as untrusted content.

### Working like Claude Code, and beyond
- `DEV.md` project memory (user, project and folder), `#` to save a note, `/memory` to edit it.
- User hooks in Claude Code's format: PreToolUse, PostToolUse, UserPromptSubmit, Stop and SessionStart.
- `/goal <objective>` keeps working until an independent reviewer confirms the goal is met.
- Slash commands with Claude Code's names, including `/permissions`, `/cost`, `/config`, `/bug` and `/rewind`.
- `dev -p` for headless runs with JSON output, and a GitHub Action.
- Background subagents, output styles, a custom status line, and a plan, do, verify loop for every model.
- Scheduled prompts: `schedules` in dev.json runs prompts on a cron schedule while DeV is running.
- Fewer silent stops: a reply that only announces its next step, or is empty, gets a "go ahead".
- Code mode and on-demand MCP servers keep requests near 20K tokens; a catalog of skills, plugins and MCP servers (`/plugins`), with superpowers and ponytail built in.

### DeV for Chrome (first slice)
- A side-panel extension that chats with DeV and can attach the current page (as untrusted content). It talks to DeV through native messaging (`devcode native-host --install --extension-id <id>`), so no port is opened; the host only forwards four calls, on sessions it created, with tools disabled.

### Identity
- DeV's saffron colour, mark and wordmark across the TUI, CLI, web favicon and desktop app; a redesigned TUI (rounded saffron prompt and dialogs, quieter conversation view, a greeting on the home screen).
- The desktop app is DeV, with its own app IDs, `devai://` links and update feed.

### Install and update
- Releases with SHA-256 checksums, `install`/`install.ps1` scripts that verify them, Homebrew and Scoop manifests, and `devcode upgrade`. Updates come only from DeV's own releases.

### Fixes ported from OpenCode
- A failed TUI worker request no longer hangs the TUI (OpenCode #54936).
- A 429 that sounds like a context overflow is treated as a rate limit (OpenCode #59649).
