<div align="center">

<img src="packages/identity/mark.svg" alt="DeV logo" width="96" height="96">

# DeV Code

**Pro coding for everyone.**

A coding agent for your terminal, with the premium features included and nothing to pay.

[Website](https://harsha-code-per.github.io/DeV) · [Docs](https://harsha-code-per.github.io/DeV/docs.html) · [Roadmap](docs/ROADMAP.md) · [Report a bug](https://github.com/Harsha-code-per/DeV/issues/new/choose)

[![License: MIT](https://img.shields.io/badge/license-MIT-F2A516)](LICENSE) [![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-121317)](#install) [![Cost](https://img.shields.io/badge/cost-free-F2A516)](#why-dev)

<img src="website/demo.gif" alt="DeV Code fixing a failing test, then showing a one-line receipt" width="760">

</div>

## Why DeV

Great tools shouldn't depend on what you can pay. A student, a freelancer and a team on a tight budget deserve the same tools as anyone else.

DeV Code includes the features that usually sit behind a paid plan, for everyone. There's no subscription and no card to add. It's open source under the MIT licence, so you can use it in your commercial work.

## Install

**Linux and macOS**

```sh
curl -fsSL https://harsha-code-per.github.io/DeV/install | sh
```

**Windows (PowerShell)**

```powershell
irm https://harsha-code-per.github.io/DeV/install.ps1 | iex
```

The installers check the download against the release's SHA-256 checksums before installing anything.

## Quick start

**1. Start DeV in your project.**

```sh
dev
```

**2. Connect a model.** Type this inside DeV. Providers with a free tier are listed first.

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
| **Subagents** | Focused helpers take on parts of a task, in parallel or in the background. |
| **Rewind** | Go back to any earlier message and restore both the conversation and your files. |
| **Project memory** | DeV keeps what it learns about your project in `DEV.md`, a file you can read and edit. |
| **OS sandbox** | On Linux and macOS, shell commands can't read your SSH keys or cloud credentials. |
| **Free model routing** | `auto/free` moves between the free models you've connected and learns which ones work for you. |
| **Built to extend** | Skills, plugins, hooks, custom agents and MCP servers are all included. |

## Modes

| Mode | What happens |
|---|---|
| **Build** | The default. DeV edits files and asks before anything risky. |
| **Plan** | DeV writes a plan and changes nothing until you approve it. |
| **Goal** | DeV keeps working until something is true, and a reviewer confirms it. |
| **Accept edits** | File edits are approved, and everything else asks as usual. |
| **Auto** | Everything that isn't denied is approved. Start DeV with `--auto`. |

## Commands

| Command | What it does |
|---|---|
| `/connect` | Add a model provider |
| `/models` | Choose a model |
| `/goal <objective>` | Keep working until something is true |
| `/steps` | Open or fold the steps of finished tasks |
| `/init` | Write a `DEV.md` for this project |
| `/rewind` | Go back to an earlier message |
| `/plugins` | Manage skills, plugins and MCP servers |

Run a single prompt from a script:

```sh
dev run "explain this repo"
```

Get the result as JSON:

```sh
dev -p "fix the failing test" --output-format json
```

The [docs](https://harsha-code-per.github.io/DeV/docs.html) cover configuration, free models and security.

## How we build it

- **Measured, not claimed.** We test DeV on [real coding tasks](bench/README.md) with hidden tests it never sees. It passes 25 of 30 on free models, at no cost.
- **Tested as you get it.** Every release is installed on clean Linux, macOS and Windows machines.
- **Secure by default.** We treat the model as untrusted. Read how in [SECURITY.md](SECURITY.md).

Model providers set their own free limits and terms. Windows doesn't have a sandbox yet.

## What's next

- **DeV for desktop:** chat and coding in one app for Windows, macOS and Linux.
- **DeV for Chrome:** an assistant in your browser that works with your other DeV apps.
- **One optional account:** your settings and connected models follow you across devices, end-to-end encrypted.

See the full [roadmap](docs/ROADMAP.md).

## Contributing

Bug fixes, docs and new ideas are all welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Please report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Credits

DeV Code builds on [OpenCode](https://github.com/anomalyco/opencode), and we're grateful to its authors. Third-party notices are in [NOTICE](NOTICE).

## License

[MIT](LICENSE)
