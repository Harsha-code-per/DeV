# Changelog

DeV Code's notable changes. DeV started as a fork of OpenCode v1.19.4 (MIT); this file covers what DeV added or changed since then.

## 1.0.14 (2026-11-06)

- Subagents can work in a git worktree of their own, as in Claude Code: put `isolation: worktree` in an agent's file, or DeV asks for it when it hands off a task. The worktree is removed afterwards if the subagent changed nothing; otherwise DeV is told its path and branch, to review and merge. The subagent gets the same settings, agents and AGENTS.md as the conversation that started it, including ones not committed yet.
- `devcode run` answers permission requests from subagents working in their own worktree.
- Idle compaction, as in Claude Code: a conversation of 100k tokens or more that you leave for 55 minutes is compacted before the prompt cache expires, so your next message sends a summary instead of the whole conversation. Turn it off with `"compaction": { "idle": false }`; `DEV_IDLE_COMPACT_MINUTES` and `DEV_IDLE_COMPACT_MIN_TOKENS` change when it happens.

## 1.0.13 (2026-11-06)

- DeV keeps to limits you set in chat. Say "don't push", "never commit or deploy" or "don't install new packages", and doing it anyway asks you first; Auto mode refuses it and tells DeV why. Saying so again later ("ok, push it") lifts the limit. This covers pushing, committing, merging, rebasing, opening pull requests, deploying, publishing, installing packages and deleting files.
- "Summarize from here" in `/rewind`: the reverse of "Summarize up to here". Everything before the message stays word for word, and that message onward becomes a summary. Use it when a long tangent filled the context but the setup before it still matters.

## 1.0.12 (2026-11-06)

- `/permissions`, as in Claude Code: your mode, what Auto mode refused this session, and your allow, ask and never-allowed rules. Press Enter on a refusal to allow it from now on, change a rule, or add one such as `bash npm publish*`. Rules apply at once, without stopping work in progress, and are saved to `~/.config/dev/dev.json`.
- A rule that names a risky command, such as `"git push --force*": "allow"`, now lets it run. Before, risky commands asked, or were refused in Auto mode, whatever your rules said.
- Code intelligence is on by default: DeV can go to a definition, find references and see a symbol's type through the project's language server. Set `DEV_EXPERIMENTAL_LSP_TOOL=false` to turn it off.
- `/add-dir` lets DeV read and edit another folder, for now or always. Auto mode then works there instead of refusing.
- `devcode -w <name>` (or `--worktree`) works in a git worktree of its own under `.dev/worktrees`, on branch `devcode/<name>`, so several sessions can change the same repo without colliding. On exit, a worktree with no changes is removed; one with changes is kept, and the same command continues in it.
- Jupyter notebooks: DeV reads a `.ipynb` as cells with their outputs, and edits one cell at a time: replace, insert or delete.
- Changing a setting, such as `/autocompact`, no longer stops the task that is running. The change applies once the task finishes.
- `/hooks` lists the hooks you have set up, or shows how to add one.
- `/keybindings` and `/statusline` open `tui.json`, where keybindings and the status line under the prompt live.
- `/tasks` lists the session's subagents, running or done, and opens one.
- `/release-notes` opens this changelog.

## 1.0.11 (2026-11-05)

- Safety fix: Auto and Goal modes no longer write files outside the project, or into `.git`, without asking. File tools aren't sandboxed, so in 1.0.9 and 1.0.10 auto mode could change files such as shell startup scripts. These writes are now refused, and DeV is told why.
- Goals are met honestly: DeV and the reviewer treat a result faked by patching tools, environment variables or config as not met.
- A goal that can never be met ends early: DeV says why, and a separate reviewer has to agree. Before, it used all 25 rounds.
- "Summarize up to here" in `/rewind` shrinks everything before a message into a summary and keeps that message onward. You can say what the summary should focus on.
- `/autocompact 100k` makes DeV compact once the conversation reaches that size, sooner than the model's limit; `/autocompact auto` goes back to the limit.

## 1.0.10 (2026-11-05)

- An unfinished goal survives restarts: continue the session and it is still there, active or paused.
- `devcode run "/goal <objective>"` works in scripts, and `--permission-mode goal` treats the message as the goal. Add `--auto` so DeV can make changes.
- `devcode run --auto` refuses risky actions and tells DeV why, the same as Auto mode in the terminal app. Before, it approved them.
- A shell command's permission prompt offers "Allow, switch to auto".
- Ctrl+O in the session list previews a session's last request and reply.

## 1.0.9 (2026-11-04)

- Five modes, cycled with Shift+Tab: Manual, Accept edits, Plan, Auto and Goal. Start in one with `--permission-mode`.
- Auto mode never asks. Risky actions are refused and DeV is told why, so it finds a safer way; after three refusals in a row, or twenty in a session, it asks you. It is now part of the Shift+Tab cycle.
- Goal mode: say what should be true when DeV is done, and it works without asking until a separate reviewer confirms it. `/goal` now shows in the `/` menu.
- Risky shell commands, such as force pushes and `npm publish`, ask first even inside the sandbox, which can still reach git hosts and package registries. Before, they ran without asking.
- The exit receipt shows `devcode -s <id>` to continue a session; it used to say `dev -s`, which doesn't work.

## 1.0.8 (2026-11-02)

- DeV remembers what you teach it. Say "from now on use pnpm" or "remember that…" and it saves a note to a private memory for the project, read at the start of every session; it also saves corrections and preferences it notices. Deny the `remember` permission to turn this off.
- Memory files can pull in others with `@path` lines, and rules in `.dev/rules/` (or `.claude/rules/`) load every session, or only for matching files when they set `paths:`.
- `/output-style` switches between default, concise, explanatory, learning and the new proactive style.
- Auto mode still asks about risky actions: deleting whole folders, force pushes, `sudo`, piping a download into a shell, publishing packages, destroying infrastructure, leaving the sandbox, and touching secrets files.
- Seven more hook events (Notification, SubagentStop, PostToolUseFailure, PreCompact, PostCompact, SessionEnd, FileChanged), and hooks can be HTTP endpoints as well as commands.

## 1.0.7 (2026-11-02)

- Long-running commands can run in the background: dev servers, watchers and long builds start, DeV checks their output when it needs to, and stops them, including everything they started. They stop when DeV exits.
- `/context` shows what fills the context window: your messages, DeV's replies, each tool's output and the fixed overhead, with suggestions once it fills up.
- `/btw` asks a side question about the conversation without interrupting the task or adding to it.
- `/loop` repeats a prompt on an interval, such as "5m check whether the deploy finished", while the session is idle; run it again to stop.
- Ctrl+R searches your earlier prompts. Renaming a session is now `/rename` only. History keeps 200 prompts.
- `/security-review`, `/simplify` and `/pr-comments` join `/review`.

## 1.0.6 (2026-11-02)

- Web search works. It had been switched off since the rename, so DeV could only fetch pages it already knew the address of. It now uses Exa or Parallel, both free with no key, and falls back to the other when one fails.
- Research is thorough: DeV searches several times and site by site, reads the pages that matter, and answers with a table of direct links and a list of what it could not confirm. On "hackathons in Hyderabad or online, 2 to 10 November" it went from no answer in seven minutes to twelve searches across eight sites with sources.
- Pages built as JavaScript apps, such as Unstop and Hack2skill, are read through a browser-rendering reader when a plain fetch finds no text.
- Skills written for Claude Code can start its `general-purpose` and `Explore` subagents.

## 1.0.5 (2026-11-02)

- DeV asks before it guesses. When a request leaves out something only you know (where, when, budget, who it is for, which style), it asks with options, the recommended one first, checkboxes when several apply, and room for your own answer. Open-ended requests such as "find hackathons I can attend" or "plan a weekend trip for me" always start by asking or by saying there is enough to go on: on DeV's free models, 10 of 10 such requests now ask, against 1 of 5 before, and clear requests still get a straight answer.
- Typing quickly no longer starts voice recording: only a held Space does.
- A waiting update stays in view beside the model name on every screen, not only at startup.
- Update checks and `devcode upgrade` use GitHub's release links instead of its API, which allows 60 requests an hour per address. A check that fails now says so instead of reporting "no updates".

## 1.0.4 (2026-11-02)

- `/voice` writes as you speak: your words appear in the prompt while you hold Space, and the final text replaces them when you let go. The speech model stays loaded while you use voice, so each update takes about a tenth of a second, and it is freed after ten idle minutes.
- The npm packages publish again: `npm i -g @devcodeagent/cli` installs the current version.

## 1.0.3 (2026-11-02)

- `/voice`: hold Space to talk, release to put the words in the prompt, Esc to cancel. Speech is turned into text on your computer, free and offline (sherpa-onnx with NVIDIA's Parakeet English model, a one-time 130 MB download), or by Groq or OpenAI if you pick cloud voice.
- DeV Code tells you when a new version is out, in a notice wherever you are. `/update` installs it, Restart reopens DeV Code on the new version in the same session, and the first start shows what's new.

## 1.0.2 (2026-11-02)

- `devcode` is DeV Code's only command. `dev` belongs to the DeV desktop app, so DeV Code no longer installs it, and removes the `dev` link that 1.0.0 and 1.0.1 added.

## 1.0.1 (2026-11-02)

- The installers add DeV Code to your PATH themselves: fish, zsh, bash or `~/.profile` on Linux and macOS, and the user PATH on Windows, so `devcode` works in every new terminal.
- The installers show each step, with a download bar, and add the C++ runtime on a bare Alpine system.
- The first launch no longer prints library warnings above the app.

## 1.0.0 (2026-11-01)

### A terminal app of its own
- Finished tasks fold into a receipt: how it ended, files, checks, time and cost, with the answer below. `/steps` or a click opens the steps.
- The running task sits on a Plan, Do, Verify spine, under a NOW bar that always says what DeV is doing.
- Home opens with a saffron band and your recent work, and exit prints a session receipt.

### Works the moment you install it
- A new user gets an answer in seconds: connecting a free key goes straight to `auto/free`, and nothing optional holds up the first launch or reply.
- Free tiers with small limits get a lean request instead of failing.
- DeV picks Build, Plan or Goal itself, and you can override it.

### Free and any-model
- `auto/free` routes each request across the free models of every connected provider, with cooldowns, a first-response window, and correct handling of context overflows and rate limits. It learns which free models actually answer and tries those first.
- Local models (Ollama, LM Studio) are detected automatically, and DeV explains how to start when nothing is connected.
- Hand a task to another coding agent you have installed (`external_agent`), so those subscriptions are used through their official tools. DeV never touches their credentials.
- OpenCode Zen is listed honestly and used only with your own Zen key.

### Safety
- Shell commands run in an OS sandbox (Linux bubblewrap, macOS Seatbelt): writes only to the project, credentials hidden, network limited to package registries and git hosts. Commands inside it run without asking; leaving it always asks. Configure it with `sandbox` in dev.json.
- Permission modes: default, accept edits, plan and auto, cycled with Shift+Tab or set with `--permission-mode`. Safe defaults ask before edits, web fetches and most shell commands.
- The local server is never unauthenticated: a password is generated when none is set.
- Web pages, search results and MCP results reach the model marked as untrusted content.

### Working the way you expect, and beyond
- `DEV.md` project memory (user, project and folder), `#` to save a note, `/memory` to edit it.
- User hooks: PreToolUse, PostToolUse, UserPromptSubmit, Stop and SessionStart.
- `/goal <objective>` keeps working until an independent reviewer confirms the goal is met.
- Slash commands, including `/permissions`, `/cost`, `/config`, `/bug` and `/rewind`.
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
