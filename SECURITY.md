# Security

DeV Code is an AI coding agent that runs on your machine. It can run shell commands, edit files and fetch web pages. This page explains what protects you, what does not, and how to report a vulnerability.

## Threat model

The model is not trusted. It can be wrong, and text it reads (files, web pages, tool output, MCP results) can try to steer it. DeV's defences are built so that a misled model still cannot do much harm without you noticing. Two layers do this: the OS sandbox and permissions.

### The OS sandbox

Shell commands run inside [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropics/sandbox-runtime) (Apache-2.0): bubblewrap on Linux, Seatbelt on macOS. The code is in [`packages/devcode/src/sandbox`](packages/devcode/src/sandbox/index.ts). Inside the sandbox a command:

- **writes** only to the project, any outside directory you approved for that command, temp folders and package-manager caches (`~/.npm`, `~/.bun`, `~/.cache`, `~/.cargo`, `~/go`, pnpm, Gradle, Maven);
- **cannot write** `.env` or `.git/hooks` in those directories;
- **cannot read** `~/.ssh`, `~/.aws`, `~/.gnupg`, the gh, gcloud, kube and Docker credentials, `~/.netrc`, `~/.git-credentials`, `~/.npmrc`, `~/.pypirc` or DeV's own `auth.json`;
- **cannot open Unix sockets** on Linux (seccomp), so it cannot talk to the Docker daemon or similar local services;
- **reaches the network** only through an allowlist proxy: package registries (npm, Yarn, Bun, PyPI, crates.io, the Go proxy) and git hosts (GitHub, GitLab, Bitbucket).

Limits you should know about:

- **Windows is not sandboxed yet.** PowerShell commands are not sandboxed on any platform.
- `DEV_DISABLE_SANDBOX=1` turns the sandbox off.
- If the sandbox cannot start (for example, bubblewrap is missing), commands run unsandboxed and DeV logs a warning.
- The sandbox covers shell commands. File edits and web fetches made by DeV itself are covered by permissions, not by the sandbox. Local MCP servers are not sandboxed yet.

### Leaving the sandbox

When the sandbox blocks a command, DeV tells the agent, which can run it again with `dangerouslyDisableSandbox`. That **always asks you** ("Shell command outside the sandbox"). Bundled allow rules never cover it. Only an "always" approval from you, or auto mode, lets it through without a prompt.

### Permissions

The bundled defaults ([`packages/devcode/src/config/dev-defaults.json`](packages/devcode/src/config/dev-defaults.json)) are:

- reading files in the project is allowed;
- file edits ask;
- web fetches ask;
- shell commands ask, except a read-only set (`ls`, `pwd`, `git status`, `git diff`, `git log`, `git show`, `git branch`, `rg`, `grep`, `cat`, `head`, `tail`, `wc`, `which`, `echo`); anything with a redirect (`>`), `--output` or `--pre` asks even then;
- sandboxed shell commands run without asking; unsandboxed ones and directories outside the project still ask.

**Deny rules always win**, in every mode.

Permission modes, cycled with Shift+Tab or set with `--permission-mode`:

| Mode | What it does |
|---|---|
| `default` | Asks as described above. |
| `accept-edits` | Approves file edits; everything else as in default. |
| plan | Plans without making changes (Shift+Tab only). |
| `auto` | Approves everything that is not denied, including leaving the sandbox. |

Auto mode joins the Shift+Tab cycle only after you start with `--auto`, `--yolo`, `--dangerously-skip-permissions` or `--permission-mode auto`, or opt in from the command palette (with a warning). Use it only in a project you are willing to lose.

### Local server

The local server listens on `127.0.0.1` by default and requires a password. Set it with `DEV_SERVER_PASSWORD`; when you do not, DeV generates a random one. If you bind it to another address (`--hostname`, `--mdns`), anyone who can reach that address and knows the password has the same power as the agent.

### Prompt injection

Any text the agent reads can contain instructions: a README, a web page, an issue, a dependency's source, an MCP server's reply. DeV does not yet mark this content as untrusted for the model. Treat the sandbox and permission prompts as your protection, read what you approve, and be careful with auto mode on untrusted code or web content.

### Out of scope

| Category | Why |
|---|---|
| Anything allowed by auto mode, `DEV_DISABLE_SANDBOX`, an "always" approval or your own allow rules | You chose to allow it. |
| Unsandboxed platforms and shells (Windows, PowerShell) | Known and documented above. |
| Server access by someone who has the password, or after you exposed the server | Expected behaviour. |
| Data sent to your model provider | Governed by that provider's policies. |
| Third-party MCP servers, plugins and skills | Outside DeV's trust boundary; they run with the access you give them. |
| Malicious config files you installed yourself | You control your own config. |
| The model doing something unhelpful within what you approved | Not a vulnerability. |

A way around the sandbox, around a deny rule, or around a permission prompt that should have appeared **is** in scope.

## Reporting a vulnerability

Report privately through [GitHub Security Advisories](https://github.com/Harsha-code-per/DeV/security/advisories/new). Please do not open a public issue.

Include the DeV version, your OS, the steps to reproduce, and what an attacker gains. Please check a report yourself before sending it; unverified, AI-generated reports will be closed.

We will acknowledge your report, keep you informed while we work on a fix, and credit you in the advisory unless you ask us not to.

DeV also watches OpenCode's security advisories and ports relevant fixes.
