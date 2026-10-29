import os from "os"
import path from "path"
import { Flag } from "@dev-ai/core/flag/flag"
import { Global } from "@dev-ai/core/global"
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime"

// DeV runs every shell command inside Anthropic's sandbox-runtime (Apache-2.0), the OS-level sandbox
// Claude Code uses: bubblewrap on Linux, Seatbelt on macOS. A command can write only to the project,
// temp folders and package-manager caches, cannot read credentials, and reaches the network only
// through an allowlist. Where the sandbox can't start, commands run unsandboxed and that is logged.

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

export function supported() {
  return !Flag.DEV_DISABLE_SANDBOX && (process.platform === "linux" || process.platform === "darwin")
}

/** Settings for one command; `writable` is the project plus any outside directory approved for it. */
export function config(writable: string[]): SandboxRuntimeConfig {
  return {
    network: { allowedDomains: NETWORK, deniedDomains: [] },
    filesystem: {
      denyRead: SECRETS.map(expand),
      allowWrite: [...writable, os.tmpdir(), "/tmp", Global.Path.tmp, ...CACHES.map(expand)],
      denyWrite: writable.flatMap((dir) => [path.join(dir, ".env"), path.join(dir, ".git", "hooks")]),
    },
  }
}

let ready: Promise<boolean> | undefined

/**
 * The command wrapped to run inside the sandbox, or undefined when it should run as is
 * (unsupported platform, disabled, or the sandbox failed to start).
 */
export async function wrap(command: string, writable: string[], shell?: string) {
  if (!supported()) return undefined
  const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime")
  ready ??= SandboxManager.initialize(config(writable)).then(
    () => true,
    (error: unknown) => {
      console.error(`DeV sandbox unavailable, shell commands run unsandboxed: ${String(error)}`)
      return false
    },
  )
  if (!(await ready)) return undefined
  return SandboxManager.wrapWithSandbox(command, shell, config(writable))
}

function expand(entry: string) {
  return entry.startsWith("~/") ? path.join(home, entry.slice(2)) : entry
}

export * as Sandbox from "."
