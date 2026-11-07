import { execFile } from "child_process"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { promisify } from "util"
import { Flag } from "@dev-ai/core/flag/flag"
import { Global } from "@dev-ai/core/global"
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime"
import type { ConfigSandboxV1 } from "@dev-ai/core/v1/config/sandbox"

const execFileAsync = promisify(execFile)

// With `"sandbox": { "enabled": true }` in dev.json, DeV runs shell commands inside Anthropic's
// sandbox-runtime (Apache-2.0), the OS-level sandbox Claude Code uses: bubblewrap on Linux, Seatbelt on
// macOS. A command can write only to the project, temp folders and package-manager caches, cannot read
// credentials, and reaches the network only through an allowlist. It is off by default, as in Claude
// Code: confined commands can't use the person's logins (gh, cloud CLIs) or reach ordinary websites.
// Where the sandbox can't start, commands run unsandboxed and that is logged.

// ponytail: fixed allowlist; make it configurable (dev.json "sandbox") when someone needs more hosts.
const NETWORK = [
  "registry.npmjs.org",
  "*.npmjs.org",
  "registry.yarnpkg.com",
  "bun.sh",
  "*.bun.sh",
  "pypi.org",
  "files.pythonhosted.org",
  "crates.io",
  "*.crates.io",
  "proxy.golang.org",
  "sum.golang.org",
  "github.com",
  "*.github.com",
  "*.githubusercontent.com",
  "gitlab.com",
  "bitbucket.org",
]

const home = os.homedir()

// Credentials a command never needs to read.
const SECRETS = [
  "~/.ssh",
  "~/.aws",
  "~/.gnupg",
  "~/.config/gh",
  "~/.config/gcloud",
  "~/.kube",
  "~/.netrc",
  "~/.docker/config.json",
  // Publish and push tokens. ponytail: blocks private-registry installs too; make it configurable when asked.
  "~/.git-credentials",
  "~/.npmrc",
  "~/.pypirc",
  path.join(Global.Path.data, "auth.json"),
]

// Package managers and build tools write their caches here.
const CACHES = ["~/.npm", "~/.bun", "~/.cache", "~/.cargo", "~/go", "~/.local/share/pnpm", "~/.gradle", "~/.m2"]

// A compiled binary can't reach the library's own vendor folder (it looks next to its module, inside
// the binary), so the build ships apply-seccomp, which blocks Unix sockets, next to the executable.
const seccomp = import.meta.path.startsWith("/$bunfs/")
  ? { applyPath: path.join(path.dirname(process.execPath), "vendor", "seccomp", process.arch, "apply-seccomp") }
  : undefined

export function supported() {
  return !Flag.DEV_DISABLE_SANDBOX && (process.platform === "linux" || process.platform === "darwin")
}

/** Whether shell commands run sandboxed: the person turned it on and this platform has one. */
export function on(settings?: ConfigSandboxV1.Info) {
  return settings?.enabled === true && supported()
}

/**
 * Settings for one command; `writable` is the project plus any outside directory approved for it, and
 * `settings` is the user's `sandbox` section in dev.json (extra hosts and paths, credentials to unhide).
 */
export function config(writable: string[], settings?: ConfigSandboxV1.Info): SandboxRuntimeConfig {
  const readable = new Set((settings?.filesystem?.allowRead ?? []).map(expand))
  return {
    network: { allowedDomains: [...NETWORK, ...(settings?.network?.allow ?? [])], deniedDomains: [] },
    filesystem: {
      denyRead: SECRETS.map(expand).filter((entry) => !readable.has(entry)),
      allowWrite: [
        ...writable,
        os.tmpdir(),
        "/tmp",
        Global.Path.tmp,
        ...CACHES.map(expand),
        ...(settings?.filesystem?.allowWrite ?? []).map(expand),
      ],
      denyWrite: writable.flatMap((dir) => [path.join(dir, ".env"), path.join(dir, ".git", "hooks")]),
    },
    seccomp,
  }
}

let ready: Promise<boolean> | undefined

/**
 * The command wrapped to run inside the sandbox, or undefined when it should run as is
 * (unsupported platform, disabled, or the sandbox failed to start).
 */
export async function wrap(command: string, writable: string[], shell?: string, settings?: ConfigSandboxV1.Info) {
  if (!on(settings)) return undefined
  const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime")
  ready ??= SandboxManager.initialize(config(writable, settings)).then(
    () => {
      exitOnStop()
      return true
    },
    (error: unknown) => {
      console.error(`DeV sandbox unavailable, shell commands run unsandboxed: ${String(error)}`)
      return false
    },
  )
  if (!(await ready)) return undefined
  // The network proxy reads the allowlist from the manager's config, so keep it in step with dev.json.
  SandboxManager.updateConfig(config(writable, settings))
  return SandboxManager.wrapWithSandbox(command, shell, config(writable, settings))
}

// Paths the sandbox write-protects, which appear as device files inside it when they don't exist.
const PLACEHOLDERS = [
  ".env",
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
  ".mcp.json",
  ".vscode",
  ".idea",
  ".claude/commands",
  ".claude/agents",
]

let excludes: Promise<string> | undefined

/**
 * Environment for a wrapped command. git refuses device files, so `git add -A` fails in any project
 * unless the placeholders are ignored. A sandboxed command can't write those paths, so ignoring them
 * there hides nothing it made. Git allows one global ignore file, so the user's own is copied in.
 */
export async function env() {
  excludes ??= (async () => {
    const configured = await execFileAsync("git", ["config", "--global", "--path", "core.excludesFile"]).then(
      (result) => result.stdout.trim(),
      () => "",
    )
    const own = await fs
      .readFile(configured || path.join(Global.Path.home, ".config/git/ignore"), "utf8")
      .catch(() => "")
    const file = path.join(Global.Path.state, "sandbox-gitignore")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, [own, ...PLACEHOLDERS].join("\n"))
    return file
  })()
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.excludesFile", GIT_CONFIG_VALUE_0: await excludes }
}

/**
 * On Linux the sandbox leaves empty read-only files (.bashrc, .env, .gitconfig…) in the project as mount
 * points for paths it protects. Call after each wrapped command, or they show up in the user's repo.
 */
export async function cleanup() {
  const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime")
  SandboxManager.cleanupAfterCommand()
}

// The library cleans up on SIGINT and SIGTERM but doesn't exit, which would turn a stop signal into a
// no-op once a shell command has run. Exiting here still runs its cleanup through the exit event.
function exitOnStop() {
  process.once("SIGTERM", () => process.exit(143))
  process.once("SIGINT", () => {
    // Interactive `dev run` handles Ctrl-C itself.
    if (process.listenerCount("SIGINT") === 0) process.exit(130)
  })
}

function expand(entry: string) {
  return entry.startsWith("~/") ? path.join(home, entry.slice(2)) : entry
}

export * as Sandbox from "."
