# Changelog

DeV Code's notable changes. DeV started as a fork of OpenCode v1.19.4 (MIT); this file covers what DeV added or changed since then.

## 1.0.24 (unreleased)

- Vim keys in the prompt. Type `/vim` to turn them on or off; DeV remembers the choice. Esc switches to normal mode, and the mode shows under the prompt. Motions (`w b e`, `0 ^ $`, `f t ; ,`, `gg G`, `h j k l`) take counts, and operators (`d c y`) work with motions and text objects such as `iw`, `i"` and `i(`. Also `x`, `r`, `~`, `J`, `p`, `.` to repeat, `u` and `ctrl+r` to undo and redo a whole change, and visual mode with `v` and `V`. Enter sends the prompt from either mode, and Esc in normal mode still interrupts DeV.
- Prompt suggestions. When DeV finishes, the empty prompt suggests what you'll probably ask next, such as "run the tests" or your answer to a question it asked. Press → to use it, or just type your own. It's one short request to your small model, sent only while the TUI is open. Type `/suggestions` to turn them off or on; DeV remembers the choice.
- `/hooks` shows prompt and agent hooks by their question instead of an empty address.

## 1.0.23 (2026-11-09)

- The advisor. When DeV is stuck after a couple of failed attempts, or faces a design choice that's costly to undo, it can ask a stronger model for advice and then carry on itself. On DeV Auto it asks a different free model from the one doing the work, preferring one that reasons. Set `"advisor_model": "provider/model"` to choose it, or turn the advisor off with `"permission": { "advisor": "deny" }`. A session asks a few times at most.

## 1.0.22 (2026-11-09)

- `@devcode` on GitHub. Run `devcode github install` in a repository: it adds a workflow, and then commenting `@devcode fix this` on an issue or pull request starts DeV Code in GitHub Actions. On an issue it opens a pull request with the change; on a pull request it pushes to that branch. Either way it replies with what it did. Only people with write access can start it, it runs on the free models by default with any provider key you add as a repository secret, and a `DEVCODE_MODEL` repository variable picks another model.

## 1.0.21 (2026-11-09)

- Background sessions. `devcode run --bg "task"` starts the task and returns at once; it keeps working after you close the terminal. `devcode session list` shows each background session as working or "needs you" (`--running` lists only those), and `devcode attach --session <id>` joins it, so you can watch it or answer a permission prompt it's waiting on. The background server runs on this machine only, behind a password only you can read, and shuts itself down after 30 minutes with nothing to do (`DEV_BACKGROUND_IDLE_MINUTES` changes that). It reloads a project's settings before starting new work there when nothing else is running.
- The TUI shows permission prompts and questions that were already waiting when it connected, for example after a restart, instead of only new ones.
- Prompt and agent hooks. A hook can be a question for a model instead of a script: `{ "type": "prompt", "prompt": "Block it if it rewrites git history. $ARGUMENTS" }`. The model answers ok or not ok with a reason, and not ok counts like exit code 2 (a blocked tool call, a blocked prompt, or more work before stopping). An `agent` hook does the same but can read files (Read, Grep, Glob) before deciding. Both run in a hidden session that is deleted afterwards, on your session's model unless the hook sets `"model": "provider/model"`.

## 1.0.20 (2026-11-09)

- Hooks written for other agents, including the ones inside marketplace plugins, now work unchanged:
  - Hooks see the common tool names (`Bash`, `Edit`, `Write`, `Read`) and field names (`tool_input.file_path`), plus `tool_use_id`. Matchers work as lists (`Edit|Write`) or patterns (`^Notebook`, `mcp__.*`).
  - A hook can answer with JSON on stdout as well as with its exit code. `PreToolUse` can allow a call without the permission prompt (a `deny` in your permissions still wins), force a prompt with `ask`, deny it with a reason, rewrite its input (`updatedInput`) or add context. `PostToolUse` can replace the tool's output or send feedback. `UserPromptSubmit` and `Stop` can block with a reason.
  - New `PermissionRequest` hook: it can approve or deny a permission prompt before you answer it. New `SubagentStart` hook.
  - Hook commands get `CLAUDE_PROJECT_DIR` (and `DEV_PROJECT_DIR`), the project folder.
  - The `Notification` hook for permission prompts fires again.
- Skills can list the tools they use in `allowed-tools` (for example `allowed-tools: Bash(git add:*), Bash(git status:*), Read`). Once the skill starts, from its `/` command or when DeV loads it, those tools run without asking for the rest of the session. A `deny` in your permissions still wins. MCP tools are written `mcp__server__tool`, or `mcp__server` for all of one server's tools.

## 1.0.19 (2026-11-09)

- `/plugins` is full from the start: DeV adds its own marketplace, rebuilt every night from the official MCP Registry and GitHub. It lists over 6,000 popular, maintained plugins, skills and MCP servers, each with its star count, and ones marked Verified come first. A server is listed only when it comes from the owner of the repo whose stars it shows. To turn the marketplace off, set `"marketplaces": { "dev": { "source": "" } }`.
- Search in `/plugins` matches descriptions as well as names, and lists the best-known matches first. Discover shows the top 100; keep typing to narrow it.
- A marketplace named in config is added the first time you open `/plugins` or run `devcode plugins`, and refreshed daily.
- A repo that is a single skill (`SKILL.md` at its root) installs as a plugin.
- MCP servers that need an API key or token say which environment variables to set.
- Everything built in can be switched off, and stays off:
  - DeV's built-in plugins (superpowers, ponytail) and any code plugin you've added are listed in `/plugins` under Installed, where you can turn each off or on. Or run `devcode plugins disable ponytail`, or set `"enabled_plugins": { "ponytail": false }`.
  - Turning an MCP server off in `/mcps` is now saved, so it stays off in later sessions. This works for the built-in servers too. Or run `devcode mcp disable <name>` and `devcode mcp enable <name>`.
- `devcode mcp list` shows a server still on its first start (often a package download) as "starting" instead of "failed". It connects in your session once ready.
- Long output piped to another program is no longer cut off at 128 KB. This affected `devcode export <session> | jq`, `devcode models --verbose` and `devcode debug skill`.
- Typing `/plugins` and pressing Enter opens the plugins dialog. Before, an older built-in command of the same name ran instead; that command is now `/catalog`.

## 1.0.18 (2026-11-07)

- Plugin marketplaces. `/plugins` lists the plugins in every marketplace you've added, with the ones you have installed first; type to search. Add a marketplace from `owner/repo` (add `#tag` to pin it), a git URL, a URL to its `marketplace.json`, or a folder. Plugins in the common open format install unchanged, with their skills, commands, agents, hooks and MCP servers, named `plugin:name`.
- Three install scopes: for you in every project, for everyone on the repo (saved in `.dev/dev.json`, which you commit), or for you in this repo only (saved in the new `.dev/dev.local.json`, kept out of git). The most specific scope wins.
- Each install is pinned to a version or commit, and DeV shows what a plugin adds before you use it, including hooks and MCP servers that run on your machine. Changes apply once running work finishes, with no restart.
- A team can list its marketplaces under `"marketplaces"` in the project's `.dev/dev.json`.
- `devcode plugins` does the same from the command line: `marketplace add|list|update|remove`, `search`, `install`, `uninstall`, `enable`, `disable`, `update` and `list`, each with `--scope user|project|local`.
- A plugin agent or command that names a model by a short alias instead of `provider/model` now runs on your session's model instead of failing.
- `DEV_DISABLE_CLAUDE_FOLDER=1` turns off reading `CLAUDE.md` files and `.claude/` folders. The older variable names still work.
- Skills you already have in a `.claude` folder work fully in DeV. DeV now also reads skills from `CLAUDE_CONFIG_DIR` (not only `~/.claude`) and from the plugins installed and enabled there, named `plugin:skill` (for example `/cloudflare:wrangler`).
- Skills are in the `/` menu, with their argument hint.
- Skill placeholders are filled in: `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}` and `${CLAUDE_SESSION_ID}`, and arguments as `$0`, `$1`, `$ARGUMENTS[N]`, `$ARGUMENTS` or named ones. A `$N` that no argument fills is left alone, so shell snippets in a skill still work.
- Skill options: `user-invocable: false` keeps a skill out of the menu, `disable-model-invocation: true` means only you can start it, and `context: fork` runs it in a subagent (`agent:` picks which).

## 1.0.16 (2026-11-07)

- DeV Auto (free) reads your images, PDFs, audio and video. A message with an attachment goes to a free model that can read it, such as a vision model from one of your free providers, instead of one that says it can't see images. If none of your free providers has such a model, DeV says so and suggests connecting one with `/connect`.
- You can see which model DeV Auto picked. Each reply is labelled "Auto → model name", and the line under the prompt shows the model that answered last. While DeV Auto switches models, for example after a rate limit, it says which one it's trying.
- Long tasks remember what you asked. When a conversation is compacted, everything you wrote is kept word for word after the summary, so an instruction like "at the end, tell me X" survives any number of compactions.
- Several DeV sessions at once (two terminals, or `devcode run` beside the TUI) no longer fail with "database is locked". Writes now wait their turn instead of failing when another session wrote at the same moment.

## 1.0.15 (2026-11-07)

- DeV works on your machine like your own terminal again. The OS sandbox is now off by default, so `gh`, cloud CLIs and `curl` use your logins and reach any site. Turn the sandbox on with `"sandbox": { "enabled": true }` in `dev.json`.
- Auto mode no longer refuses a command just because it runs outside the sandbox. It judges the command itself: reading your repos goes ahead, deleting your home folder doesn't.
- When Auto mode refuses something and DeV really needs it, DeV tries again and you get the normal permission dialog, where Allow once and Allow always work. Before, DeV asked with a question whose answer couldn't approve anything, so it got stuck.
- Web fetches try again after a network hiccup (or a 429 or 5xx answer) instead of reporting the site as unreachable.
- The "What's new" screen after an update fits the terminal: long notes scroll (arrow keys, Page Up/Down or the mouse wheel) and the ok button stays visible.
- A long folder path in the footer is shortened from the left instead of overlapping the status beside it in a narrow terminal.

## 1.0.14 (2026-11-06)

- Subagents can work in a git worktree of their own: put `isolation: worktree` in an agent's file, or DeV asks for it when it hands off a task. The worktree is removed afterwards if the subagent changed nothing; otherwise DeV is told its path and branch, to review and merge. The subagent gets the same settings, agents and AGENTS.md as the conversation that started it, including ones not committed yet.
- `devcode run` answers permission requests from subagents working in their own worktree.
- Idle compaction: a conversation of 100k tokens or more that you leave for 55 minutes is compacted before the prompt cache expires, so your next message sends a summary instead of the whole conversation. Turn it off with `"compaction": { "idle": false }`; `DEV_IDLE_COMPACT_MINUTES` and `DEV_IDLE_COMPACT_MIN_TOKENS` change when it happens.

## 1.0.13 (2026-11-06)

- DeV keeps to limits you set in chat. Say "don't push", "never commit or deploy" or "don't install new packages", and doing it anyway asks you first; Auto mode refuses it and tells DeV why. Saying so again later ("ok, push it") lifts the limit. This covers pushing, committing, merging, rebasing, opening pull requests, deploying, publishing, installing packages and deleting files.
- "Summarize from here" in `/rewind`: the reverse of "Summarize up to here". Everything before the message stays word for word, and that message onward becomes a summary. Use it when a long tangent filled the context but the setup before it still matters.

## 1.0.12 (2026-11-06)

- `/permissions`: your mode, what Auto mode refused this session, and your allow, ask and never-allowed rules. Press Enter on a refusal to allow it from now on, change a rule, or add one such as `bash npm publish*`. Rules apply at once, without stopping work in progress, and are saved to `~/.config/dev/dev.json`.
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
- Skills written for other agents can start their `general-purpose` and `Explore` subagents.

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
