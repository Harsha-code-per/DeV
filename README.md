<div align="center">

<img src="packages/identity/mark.svg" alt="DeV logo" width="96" height="96">

# DeV

**One assistant for your computer, your browser and your code. Every pro feature. Any model. Free.**

DeV is an AI assistant that works for you. You ask, by voice or text, and it does the work: on your computer, in your browser and in your code. It asks before anything private or risky, and hands you the one step it can't do. You bring the model: a free tier DeV sets up for you, a model running on your own machine, or your own key.

**DeV Code**, the developer tool, is available now. The DeV desktop assistant and DeV for Chrome are in development, and all of them will share your sessions, permissions and memory.

[Website](https://trydev.work) · [Docs](https://trydev.work/docs.html) · [Roadmap](docs/ROADMAP.md) · [Report a bug](https://github.com/Harsha-code-per/DeV/issues/new/choose) · [Sponsor](#support-dev)

[![License: MIT](https://img.shields.io/badge/license-MIT-F2A516)](LICENSE) [![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-121317)](#install-dev-code) [![Price](https://img.shields.io/badge/price-free-F2A516)](#why-dev)

<img src="website/demo.gif" alt="DeV Code fixing a failing test, then showing a one-line receipt" width="760">

</div>

## Why DeV

The model is only half of a coding agent. The other half decides whether it plans before it edits, proves the work before calling it done, stays out of your secrets, and picks up where it left off. That half is usually what a subscription pays for.

DeV is that half, free and open source under the MIT licence. Use it with whatever model you have, switch whenever you like, and use it in your commercial work.

## Bring your own model

DeV doesn't sell or resell AI. You connect the model, and DeV works with all of these:

| Option | What it costs | How |
|---|---|---|
| **Free tiers** | Nothing. The provider sets its own limits. | `/connect` lists providers with a free tier first. **DeV Auto** moves between the free models you've connected, sends images and PDFs to one that can read them, and learns which ones work for you. |
| **Models on your machine** | Nothing, and nothing leaves your computer | A model server running on your machine is found automatically. |
| **Your own key** | What your provider charges you | Add a key for any major provider, or any endpoint that speaks the standard chat completions API, with `/connect`. |

Your keys stay on your machine. DeV has no account, no server in the middle and no telemetry you didn't choose.

## The DeV family

| Product | What it is | Get it | Status |
|---|---|---|---|
| **DeV** | The assistant. Runs in the background on Windows, macOS and Linux, wakes to your voice and carries out tasks across your apps and accounts, asking before anything private. | Installers: `.exe`, `.dmg` and Linux packages | In development |
| **DeV Code** | The developer tool. Plans, builds, tests and proves software work in your terminal and editor. | `curl`, npm, pnpm, bun, apt, dnf or Scoop | Available now |
| **DeV for Chrome** | DeV in your browser: reads the page, fills forms and gets things done on any site, with your permission per site. | Browser extension | In development |
| **DeV for Web** | A chat site for the models you bring, with nothing to install. | Your browser | Planned |

## Install DeV Code

**Linux and macOS**

```sh
curl -fsSL https://trydev.work/install | sh
```

**Windows (PowerShell)**

```powershell
irm https://trydev.work/install.ps1 | iex
```

**npm**

```sh
npm i -g @devcodeagent/cli
```

**pnpm**

```sh
pnpm add -g @devcodeagent/cli
```

**bun**

```sh
bun add -g @devcodeagent/cli
```

**Debian, Ubuntu, Mint, Pop!_OS**

```sh
curl -fsSLo /tmp/devcode.deb https://github.com/Harsha-code-per/DeV/releases/latest/download/devcode-linux-x64.deb && sudo apt install /tmp/devcode.deb
```

**Fedora, RHEL, Rocky, AlmaLinux**

```sh
sudo dnf install https://github.com/Harsha-code-per/DeV/releases/latest/download/devcode-linux-x64.rpm
```

On ARM Linux, use `devcode-linux-arm64.deb` or `devcode-linux-arm64.rpm`.

**Scoop (Windows)**

```powershell
scoop install https://github.com/Harsha-code-per/DeV/releases/latest/download/devcode.json
```

The install scripts and the npm package check every download against the release's SHA-256 checksums before installing anything, and every release lists the checksums of its packages.

## Quick start

**1. Start DeV Code in your project.**

```sh
devcode
```

**2. Connect a model.** Type this inside DeV Code. Providers with a free tier are listed first.

```text
/connect
```

**3. Say what you want built.** DeV picks how to work, and you can change it at any time with Shift+Tab.

## Features

| Feature | What you get |
|---|---|
| **Plans you approve** | For larger work, DeV reads the code and writes a plan. Nothing changes until you say yes. |
| **Goals it finishes** | Ask it to keep going until the tests pass. An independent reviewer checks the result before the goal ends. |
| **Work it can prove** | DeV runs your tests or build before saying a task is done. Every finished task ends in a receipt. |
| **Live status** | A bar at the top always says what DeV is doing, and which step of the plan it's on. |
| **Subagents** | Focused helpers take on parts of a task, in parallel or in the background. A fork starts with the whole conversation, so it needs no briefing. While they work, helpers and the main conversation can message each other, and you see those messages. Add `isolation: worktree` to an agent's file and it works in a git worktree of its own. |
| **Rewind** | Go back to any earlier message and restore both the conversation and your files. |
| **Project memory** | DeV keeps what it learns about your project in `DEV.md`, a file you can read and edit. |
| **OS sandbox** | Optional. Turn it on with `"sandbox": { "enabled": true }` and, on Linux and macOS, shell commands can't read your SSH keys or cloud credentials. Off by default, so commands use your logins (`gh`, cloud CLIs) and network like your own terminal. |
| **The advisor** | When DeV is stuck, or a choice would be costly to undo, it asks a stronger model for advice and carries on. |
| **In VS Code** | The DeV Code extension opens DeV beside your file (`Ctrl+Esc`), shares your selection as you move, and mentions the selected lines with `Ctrl+Alt+K`. Get `devcode-vscode.vsix` from the [latest release](https://github.com/Harsha-code-per/DeV/releases/latest) and run `code --install-extension devcode-vscode.vsix`. |
| **Pages you can see** | Ask for a chart, a report, a diagram or a small tool and DeV makes a web page and opens it in your browser. Pages stay on your computer, one folder per project; asking again by the same name updates the page. Off with `"permission": { "artifact": "deny" }`. |
| **Voice** | `/voice`: hold Space and talk. Speech becomes text on your computer, free and offline. |
| **Plugin marketplaces** | Add any plugin marketplace in the common open format (`/plugins`, or `devcode plugins marketplace add owner/repo`) and install plugins with their skills, commands, agents, hooks and MCP servers, for you, for your team's repo, or just for your checkout. |
| **Background sessions** | `devcode run --bg "task"` keeps working after you close the terminal. `devcode session list --running` shows what's working and what's waiting for you, and `devcode attach --session <id>` picks it up. |
| **`@devcode` on GitHub** | `devcode github install` adds a workflow: comment `@devcode fix this` on an issue and DeV opens a pull request. |
| **Remembers what you teach it** | Say "from now on use pnpm" and it's saved for the project. |
| **Your keyboard, your way** | Vim keys (`/vim`), suggested next prompts (→ to use), and a screen reader mode (`devcode --screen-reader`). |
| **Built to extend** | Skills, plugins, hooks (scripts, or a question for a model), custom agents and MCP servers are all included. |

## Modes

| Mode | What happens |
|---|---|
| **Manual** | DeV asks before it edits files or does anything risky. With the sandbox on, commands inside it run without asking. |
| **Accept edits** | File edits go ahead, and everything else asks as usual. |
| **Plan** | DeV writes a plan and changes nothing until you approve it. |
| **Auto** | DeV never asks. Risky actions (deleting folders, force pushes, publishing, `sudo`, writing outside the project, secrets files) are refused and DeV finds another way. If DeV really needs one and tries it again, you're asked, as you are after three refusals in a row or twenty in a session. To let one through from now on, allow it in `/permissions`. |
| **Goal** | Auto, and DeV keeps working on your next message until it is true and a separate reviewer confirms it. Also `/goal <objective>`, or `devcode run --auto "/goal <objective>"` in scripts. An unfinished goal comes back when you continue the session. |

Shift+Tab cycles them in that order, and a shell command's permission prompt can approve it and switch to Auto. Start in one with `--permission-mode manual|accept-edits|plan|auto|goal`, or `--auto`.

## Commands

| Command | What it does |
|---|---|
| `/connect` | Add a model provider |
| `/models` | Choose a model |
| `/goal <objective>` | Keep working until something is true |
| `/steps` | Open or fold the steps of finished tasks |
| `/init` | Write a `DEV.md` for this project |
| `/rewind` | Go back to an earlier message, or summarize everything before it |
| `/autocompact` | Set how full the conversation gets before DeV compacts it |
| `/plugins` | Find, install and manage plugins from marketplaces |
| `/permissions` | Change the mode, allow what Auto mode refused, and edit rules |
| `/add-dir` | Let DeV work in another folder |
| `/hooks` | See the hooks you have set up |
| `/keybindings`, `/statusline` | Edit keybindings and the status line in `tui.json` |
| `/tasks` | See the session's subagents and open one |

Run a single prompt from a script:

```sh
devcode run "explain this repo"
```

Get the result as JSON:

```sh
devcode -p "fix the failing test" --output-format json
```

Install a plugin for everyone on the repo:

```sh
devcode plugins marketplace add owner/repo
devcode plugins install some-plugin --scope project
```

Work in a git worktree of its own, so parallel sessions don't collide:

```sh
devcode -w fix-login
```

The [docs](https://trydev.work/docs.html) cover configuration, free models and security.

## How we build it

- **Measured, not claimed.** We test DeV on [real coding tasks](bench/README.md) with hidden tests it never sees. On free models it passes 27 of 30, and the run cost nothing.
- **Tested as you get it.** Every release is installed on clean Linux, macOS and Windows machines.
- **Secure by default.** We treat the model as untrusted. Read how in [SECURITY.md](SECURITY.md).

Model providers set their own free limits and terms. Windows doesn't have a sandbox yet.

## Support DeV

DeV is built by one developer, without funding, on free tools and free tiers. If you'd like to see it grow faster, please [sponsor the project](https://github.com/sponsors/Harsha-code-per). Every sponsorship goes into building DeV, and DeV stays free for everyone.

You can also help by starring the repo, reporting bugs and telling other developers.

See where we're heading on the [roadmap](docs/ROADMAP.md).

## Contributing

Bug fixes, docs and new ideas are all welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Please report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Credits

DeV Code builds on [OpenCode](https://github.com/anomalyco/opencode), and we're grateful to its authors. Third-party notices are in [NOTICE](NOTICE).

## License

[MIT](LICENSE)
