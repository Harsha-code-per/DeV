# DeV roadmap

DeV gives everyone the premium features of an AI agent, free, with any model they bring. This page shows what we're building and where it stands. A ticked item is verified on the compiled release, not just in the source.

## The DeV family

| Product | What it is | How you get it | Status |
|---|---|---|---|
| **DeV Code** | A coding agent for your terminal | `curl`, npm, pnpm or bun | 1.0 |
| **DeV** | An assistant for Windows, macOS and Linux that runs in the background, wakes to your voice and works across your computer | Installers (`.exe`, `.dmg`, Linux packages) | In development |
| **DeV for Chrome** | A browser extension that helps you debug and get things done on any page | Browser extension | In development |
| **DeV for Web** | A chat site for free AI models, with nothing to install | Your browser | Planned |

## Principles

- **Free first.** Every feature is for everyone, and no paid model is used unless you choose one.
- **Secure by default.** Shell commands run in an OS sandbox, and risky actions ask first.
- **Light on your machine.** Heavy pieces load on demand and stop when idle.
- **Measured, not claimed.** Benchmarks and clean-machine tests decide what we say.

## DeV Code 1.0

### Done

- [x] Installs on clean Linux, macOS, Alpine and Windows machines, with checksums verified
- [x] One npm package that works with npm, pnpm and bun
- [x] A new user can connect a free model and get an answer in under a minute
- [x] Clear status at all times, and no silent hangs
- [x] Free models routed automatically, with small free tiers handled
- [x] DeV picks Build, Plan or Goal from your request
- [x] Receipts for finished work and a live view of the current task
- [x] OS sandbox on Linux and macOS, tested in CI
- [x] Long sessions survive compaction
- [x] Subagents, rewind, project memory, skills, plugins, hooks and MCP servers
- [x] Its own name and identity throughout

### Before release

- [x] Benchmark at 25 of 30 or better on the release build: 27 of 30 on v0.9.0-rc.5, at no cost
- [ ] The owner uses it for real work for two weeks
- [ ] Five outside testers finish a real task without help
- [x] DeV's own plugin SDK on npm: `@devcodeagent/sdk` and `@devcodeagent/plugin` 1.0.0, which DeV installs for plugins
- [x] Public install (`curl`, npm, pnpm, bun) and upgrade tested from clean machines
- [ ] Name and trademark check, and a domain

## After 1.0

### DeV Code

- [ ] Use a paid AI plan you already have, where its provider allows open-source tools
- [ ] Windows sandbox, and sandboxing for local MCP servers
- [ ] Memory across projects, with privacy controls
- [ ] Benchmark regressions blocking merges in CI

### DeV

- [ ] Chat and coding in one window, sharing sessions with the terminal
- [ ] Background mode, tray and start at login, with an idle budget of 150 MB
- [ ] Voice, local and free: wake word, speech recognition and dictation
- [ ] Computer use on Windows, macOS and Linux
- [ ] Installers for every platform

### DeV for Chrome

- [ ] Side-panel chat that works in your real browser
- [ ] Per-site permissions, and confirmation for anything sensitive
- [ ] Debugging tools: console, network and screenshots

### DeV for Web

- [ ] A chat site with static hosting, where each user adds their own free key
- [ ] Shared free access, once sponsorship can pay for it

### Across the family

- [ ] One optional account that carries your settings and models across devices, end-to-end encrypted
- [ ] Onboarding that sets up free models for you
- [ ] Docs in more languages

## Support

DeV is built without funding. If you'd like it to grow faster, please [sponsor the project](https://github.com/sponsors/Harsha-code-per).
