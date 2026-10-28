# DeV

A personal, always-on AI assistant for your machine, coding-first. It runs on **any** AI provider, and free ones work out of the box.

DeV's engine is a fork of [OpenCode](https://github.com/anomalyco/opencode) (MIT) in [`engine/`](https://github.com/Harsha-code-per/opencode/tree/dev-engine). It adds:

- **`auto/free` model** (the default): every request is routed across all free models from your connected providers. When one fails or hits its rate limit, DeV moves to the next and puts the failed one on cooldown. To start free, connect any free-tier provider with `/connect` (Groq, Google Gemini, OpenRouter, Cerebras, NVIDIA and Mistral are listed first), or run a local model with [Ollama](https://ollama.com); guided first-run setup is in progress (see [ROADMAP.md](docs/ROADMAP.md), R0).
- **Built-in add-ons**, all on by default: [ponytail](https://github.com/DietrichGebert/ponytail) (lean coding in every session; `/ponytail lite|full|ultra|off`, `/ponytail-review`), [superpowers](https://github.com/obra/superpowers) skills, [context7](https://github.com/upstash/context7) docs, [REA](https://github.com/morluto/rea) (reverse engineering) and [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (browser).
- **MCP servers that start on demand**: a local server only starts when one of its tools is called, and stops after 10 idle minutes. A plain prompt peaks around 760 MB (it was about 1.8 GB with every server running).
- **One credential store**: connect providers with `/connect` inside DeV. No `.env` files.

## Install (Linux x64)

Requires [Bun](https://bun.sh) ≥ 1.3 and git. REA also needs Node ≥ 26.12.1 (or ^24.22.1 / ^22.23.4).

```sh
git clone --recursive https://github.com/Harsha-code-per/DeV.git && cd DeV/engine
bun install
cd packages/opencode
OPENCODE_VERSION=1.19.4 OPENCODE_CHANNEL=dev-engine \
  ../../../scripts/capped -- bun run script/build.ts --single --skip-install --skip-embed-web-ui
ln -sf "$PWD/dist/opencode-linux-x64/bin/opencode" ~/.local/bin/dev
```

`--single` builds only for your machine. Drop it to build every target: Linux x64/arm64 (glibc and musl), baseline builds for older CPUs, macOS and Windows.

## Use

```sh
dev                 # interactive TUI
dev run "explain this repo"
```

Inside the TUI:
- `/connect` adds a provider (Groq, OpenRouter, Gemini, Cerebras, NVIDIA, any OpenAI-compatible endpoint, …). Each one you add widens the free pool.
- `/models` pins a specific model instead of `auto/free`.
- `/plugins` (or `dev catalog list|search|install|uninstall|enable|disable [--scope user|project]`) browses and manages the built-in catalog of skills, plugins and MCP servers. DeV can also install what a task needs by itself, after asking you.
- `/mcp` turns servers on or off. Set `DEV_DISABLE_MCP_LAZY=1` to start every server eagerly.

## Develop

- Run builds, typechecks and tests through `scripts/capped [MAX] -- <cmd>`. It puts a cgroup memory cap on the command, so a runaway process gets killed instead of freezing the desktop. The engine typecheck needs about 6G: `scripts/capped 6G -- bun typecheck`.
- Run engine tests from `engine/packages/opencode` with `bun test`. Engine commits follow `engine/AGENTS.md`.
- `app/os_presence/` is the Python hotkey and popup layer, which will be connected to `dev serve` in Phase 2. Run its tests with `uv run pytest`.
- The old custom Python engines are kept at git tag `pre-opencode`.

## Roadmap

1. ✅ Engine fork, free-model auto-router, built-in add-ons
2. Marketplace: catalog of skills, plugins and MCPs, `/plugins` with project and user scope, MCPs that DeV starts on demand and installs itself, auto-updates
3. Always-on presence: daemon, hotkey popup, notifications, browser and computer use
4. Voice: wake word, local speech-to-text and text-to-speech
5. Onboarding interview: personalise DeV for each user
