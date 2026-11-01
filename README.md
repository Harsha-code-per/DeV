# DeV

DeV is a family of open-source AI assistants that work with any model, and with free and local models out of the box.

| Product | What it is | Status |
|---|---|---|
| **DeV Code** | A coding agent for the terminal. Commands `devcode` and `dev`. | Available now |
| **DeV** (app) | A desktop app for Windows, macOS and Linux: chat and coding in one. | Coming |
| **DeV for Chrome** | A browser extension that works with the app and DeV Code. | Coming |

DeV is MIT licensed and is not affiliated with Anthropic or OpenCode. The plan is in [docs/ROADMAP.md](docs/ROADMAP.md).

![DeV fixing a failing test on a free model, then showing a one-line receipt](website/demo.gif)

## What DeV Code does today

- **Free by default.** The default model, `auto/free`, routes each request across the free models of every provider you have connected. When one fails or hits its rate limit, DeV moves to the next and puts the failed one on cooldown. It also handles context overflow and slow first responses.
- **Local models.** Ollama and LM Studio are detected automatically. With nothing connected, `dev` explains how to start.
- **OS sandbox.** Shell commands run in an OS sandbox on Linux (bubblewrap) and macOS (Seatbelt): they can write only to the project, temp folders and package caches, cannot read your credentials, and reach only package registries and git hosts. Leaving the sandbox always asks you. Windows is not sandboxed yet. See [SECURITY.md](SECURITY.md).
- **Permission modes like Claude Code.** Shift+Tab cycles default (asks before edits, web fetches and most shell commands) → accept edits → plan → auto. Or start with `--permission-mode default|accept-edits|auto`. Deny rules always win.
- **MCP servers on demand.** A local MCP server starts only when one of its tools is called and stops after 10 idle minutes.
- **Code mode.** Instead of sending every MCP tool to the model, DeV gives it one `execute` tool that runs a short, confined script calling those tools. Together with ponytail, this cut input from about 107K to about 20K tokens per request in our measurements.
- **A catalog of skills, plugins and MCP servers.** Browse and manage it with `/plugins` or `dev catalog`, in user or project scope. The agent can install what a task needs, after asking you.
- **Built in:** [superpowers](https://github.com/obra/superpowers) skills, [ponytail](https://github.com/DietrichGebert/ponytail) (lean code; `/ponytail lite|full|ultra|off`), [context7](https://github.com/upstash/context7) docs, [REA](https://github.com/morluto/rea) (reverse engineering) and [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (browser).

## Install

```sh
curl -fsSL https://harsha-code-per.github.io/DeV/install | sh   # Linux and macOS
irm https://harsha-code-per.github.io/DeV/install.ps1 | iex     # Windows PowerShell
npm i -g devcode                                                # any of them
```

The installers verify the release's SHA-256 checksums. Update with `dev upgrade`.

To work on DeV itself, you need [Bun](https://bun.sh) and git: `bun install`, then `bun dev`. `scripts/install-local` builds your checkout and links `dev` to it.

## Quick start

```sh
dev                          # interactive TUI in the current folder
dev run "explain this repo"  # one-off prompt
```

Inside the TUI:

- `/connect` adds a provider (Groq, Google Gemini, OpenRouter, Cerebras, NVIDIA, Mistral, any OpenAI-compatible endpoint, and more). Each one you add widens the free pool. Keys are kept in DeV's own credential store; no `.env` files.
- `/models` pins a specific model instead of `auto/free`.
- `/plugins` manages skills, plugins and MCP servers; `/mcp` turns servers on or off.
- Shift+Tab changes the permission mode.

## OpenCode Zen

OpenCode Zen is OpenCode's hosted model service. DeV lists it in `/connect` and uses it only with your own Zen key; DeV never uses it without one. Zen's own terms and data-use policy apply.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Credits

DeV started as a fork of [OpenCode](https://github.com/anomalyco/opencode) (MIT), v1.19.4. Thanks to its authors for the engine. The OS sandbox is Anthropic's [sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (Apache-2.0). Third-party notices are in [NOTICE](NOTICE).

## License

[MIT](LICENSE).
