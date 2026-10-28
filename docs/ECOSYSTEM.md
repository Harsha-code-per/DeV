# Ecosystem catalog

Open-source projects DeV builds in, adopts or learns from. Star counts and licences were checked on 2026-10-28.

**Licence rule:** MIT, Apache-2.0 and BSD can be bundled. GPL and AGPL only as separate processes, never linked. No licence, Commons Clause or other non-standard licences: skip.

**Decision key:**
- **P1**: built in now
- **P1.5**: marketplace phase
- **P2**: presence and daemon
- **P3**: voice
- **study**: mine it for ideas
- **skip**: not used

## Built in (Phase 1)

| Repo | ★ | Licence | What DeV gets | How |
|---|---|---|---|---|
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | 222k | MIT | Engine: TUI, agent loop, 75+ providers, LSP, MCP, skills, plugins | Fork in `engine/` |
| [obra/superpowers](https://github.com/obra/superpowers) | 306k | MIT | Skills: brainstorm, plan, TDD, debug, review | Plugin, on by default |
| [upstash/context7](https://github.com/upstash/context7) | 64k | MIT | Up-to-date library docs | Remote MCP, on (no local memory cost) |
| [morluto/rea](https://github.com/morluto/rea) | 397k | MIT | Reverse engineering of apps, binaries and web | Local MCP, off until enabled (~450 MB) |
| [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | 54k | Apache-2.0 | Real browser: debugging, performance, screenshots | Local MCP, off until enabled (~600 MB) |
| [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi) | 43k | MIT | Free-tier routing ideas: failover, cooldown, quota tracking | Reimplemented as the `auto/free` model (`engine/packages/devcode/src/provider/auto.ts`) |

## Next: marketplace (P1.5)

| Repo | ★ | Licence | Use |
|---|---|---|---|
| [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | 104k | Apache-2.0 | Memory across sessions; has an OpenCode installer (`npx claude-mem install --ide opencode`) |
| [wshobson/agents](https://github.com/wshobson/agents) | 42k | MIT | 202 subagents, 185 skills, 105 commands; generates OpenCode output (`make install-opencode`) |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | 34k | MIT | GitHub issues, PRs and CI (needs a token, so opt-in) |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 111k | MIT | Production engineering skills |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | 116k | Apache-2.0 | Token reduction: free tiers go further |
| [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | 48k | MIT | Persistent code knowledge graph |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | 137k | Apache-2.0 | Repo, docs and SQL as a queryable graph (overlaps codebase-memory; pick one) |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | 39k | Apache-2.0 | Scripted browser automation (alternative to chrome-devtools) |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 142k | MIT | UI/UX design skill |
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) | 149k | MIT | Study: one desktop manager for several agents' providers and MCPs |

## Presence and Jarvis layer (P2)

| Repo | ★ | Licence | Use |
|---|---|---|---|
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | 393k | MIT | Always-on assistant on any OS and chat platform. Evaluate as DeV's presence layer before building our own |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 258k | MIT | Self-improving personal agent with memory. Evaluate alongside OpenClaw |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | 119k | MIT | Autonomous browser agent (browser-level Jarvis) |
| [trycua/cua](https://github.com/trycua/cua) | 31k | MIT | Computer-use drivers and sandboxes |
| [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) | 39k | Apache-2.0 | Multimodal desktop control |
| [supermemoryai/supermemory](https://github.com/supermemoryai/supermemory) | 31k | MIT | Local memory engine for personal context |
| [topoteretes/cognee](https://github.com/topoteretes/cognee) | 33k | Apache-2.0 | Memory and knowledge graph |

## Voice (P3): all local and free

| Repo | ★ | Licence | Use |
|---|---|---|---|
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) | 55k | MIT | Speech-to-text; runs on CPU or the RTX 3050 |
| [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 26k | MIT | Python STT alternative |
| [cjpais/Handy](https://github.com/cjpais/Handy) | 35k | MIT | Offline system-wide dictation; study its UX |
| [dscripka/openWakeWord](https://github.com/dscripka/openWakeWord) | 3k | Apache-2.0 | "Hey DeV" wake word |
| [rhasspy/piper](https://github.com/rhasspy/piper) | 11k | MIT | Text-to-speech. Avoid the GPL fork `piper1-gpl` |
| [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) | 17k | BSD-2 | Real-time voice pipeline (interruptions, turn-taking) |

## Use cases mined from [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) (143k, Apache-2.0)

These become DeV skills or scheduled jobs. We re-implement the idea, we don't copy the app.

- **Always-on agents** (Hacker News briefing, Release Radar): scheduled DeV jobs, e.g. a morning brief, and alerts when dependencies you use get new releases.
- **Agent skills** (Dependency Doctor, Commit Archaeologist, Scope Creep Detector, Self-Improving Skills): candidate built-in skills.
- **Voice** (open-source Wispr Flow-style dictation): P3 dictation mode.
- **MCP agents** (Multi-MCP router, Browser and GitHub MCP agents): this pattern is the basis of the P1.5 autonomous catalog tool.
- **Memory** (personalised memory, shared memory across multiple LLMs): P4 onboarding profile, memory shared across providers.
- **Optimisation** (Toonify, Headroom context optimisation): stretches free-tier context and quotas.

## Skip (licence)

- `code-yeongyu/oh-my-openagent`: non-standard licence
- `eyaltoledano/claude-task-master`: Commons Clause
- `anthropics/skills`: no licence
- AGPL/GPL tools (OpenViking, VoiceStudio, agenticSeek): separate processes only, if ever
