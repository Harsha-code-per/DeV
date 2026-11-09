import { LayerNode } from "@dev-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@dev-ai/core/effect/app-node-builder"
import { Effect, Layer, Schema, Context } from "effect"
import { serviceUse } from "@dev-ai/core/effect/service-use"
import { makeRuntime } from "@dev-ai/core/effect/runtime"
import fs from "fs"
import path from "path"
import semver from "semver"
import { InstallationLocal, InstallationVersion } from "@dev-ai/core/installation/version"
import { InstallationEvent } from "@dev-ai/schema/installation-event"
import { SourceInstall } from "@/cli/source-install"
import { Process } from "@/util/process"

// DeV Code updates come only from DeV's own GitHub releases, through `devcode upgrade` or the package
// manager it was installed with. Nothing here ever installs another product.

export type Method = "curl" | "npm" | "brew" | "scoop" | "system" | "unknown"

export const Event = InstallationEvent

export const Info = Schema.Struct({
  version: Schema.String,
  latest: Schema.String,
}).annotate({ identifier: "InstallationInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {
  override get message() {
    return this.stderr
  }
}

export function isUpdate(current: string, latest: string) {
  if (!semver.valid(latest)) return false
  if (!semver.valid(current)) return true
  return semver.gt(latest, current)
}


export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  /** The newer version if there is one, the installed version if not, and undefined if the check failed. */
  readonly latest: (method?: Method) => Effect.Effect<string | undefined>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@dev-ai/Installation") {}

export const use = serviceUse(Service)

const layer = Layer.succeed(
  Service,
  Service.of({
    info: Effect.fn("Installation.info")(function* () {
      return { version: InstallationVersion, latest: (yield* latestRelease()) ?? InstallationVersion }
    }),
    method: Effect.fn("Installation.method")(function* () {
      return installMethod()
    }),
    latest: Effect.fn("Installation.latest")(function* () {
      return yield* latestRelease()
    }),
    upgrade: Effect.fn("Installation.upgrade")(function* (method: Method, target: string) {
      if (method === "system")
        return yield* new UpgradeFailedError({
          stderr: `DeV Code was installed with your system's package manager. Update it with:\n  ${systemUpdate()}`,
        })
      const command = upgradeCommand(method, target)
      if (!command)
        return yield* new UpgradeFailedError({ stderr: "DeV Code is running from source; update it with git pull." })
      const result = yield* Effect.promise(async () => {
        const run = await Process.run(command, { nothrow: true })
        return { code: run.code, stdout: run.stdout.toString(), stderr: run.stderr.toString() }
      })
      if (result.code !== 0)
        return yield* new UpgradeFailedError({
          stderr: (result.stderr || result.stdout).trim() || `Upgrade failed (exit code ${result.code})`,
        })
      yield* Effect.logInfo("upgraded", { method, target })
    }),
  }),
)

function installMethod(): Method {
  if (InstallationLocal || SourceInstall.checkout()) return "unknown"
  const binary = fs.realpathSync(process.execPath)
  // The .deb, .rpm and AUR packages all install to /usr/lib/devcode, which only root can change.
  if (binary.startsWith("/usr/lib/devcode/")) return "system"
  const parts = binary.split(path.sep)
  // The npm launcher keeps the program in ~/.devcode/npm/<version>.
  if (parts.includes("node_modules") || parts.includes("npm")) return "npm"
  if (parts.includes("Cellar")) return "brew"
  if (parts.includes("scoop")) return "scoop"
  return "curl"
}

function upgradeCommand(method: Method, target: string) {
  if (method === "curl") return [process.execPath, "upgrade", target]
  if (method === "npm") return ["npm", "install", "-g", `@devcodeagent/cli@${target}`]
  if (method === "brew") return ["brew", "upgrade", "devcode"]
  if (method === "scoop") return ["scoop", "install", `devcode@${target}`]
}

/** How to update a .deb, .rpm or AUR install, which only the system's package manager may change. */
export function systemUpdate() {
  const latest = "https://github.com/Harsha-code-per/DeV/releases/latest/download"
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  if (fs.existsSync("/usr/bin/pacman")) return "yay -Syu devcode-bin"
  if (fs.existsSync("/usr/bin/dpkg"))
    return `curl -fsSLo /tmp/devcode.deb ${latest}/devcode-linux-${arch}.deb && sudo apt install /tmp/devcode.deb`
  return `sudo dnf install ${latest}/devcode-linux-${arch}.rpm`
}

// github.com's own "latest release" link redirects to the newest tag. Unlike the API, which allows 60
// requests an hour per address and then fails (shared offices and colleges hit that), it has no hourly
// limit. A failed check is undefined, so nobody is told "up to date" when the check never happened.
const latestRelease = Effect.fnUntraced(function* () {
  const found = yield* Effect.tryPromise(async () => {
    const response = await fetch("https://github.com/Harsha-code-per/DeV/releases/latest", {
      headers: { "User-Agent": `devcode/${InstallationVersion}` },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    })
    const tag = response.headers.get("location")?.match(/\/releases\/tag\/v?([^/?#]+)$/)?.[1]
    if (!tag) throw new Error(`GitHub answered ${response.status} without a release`)
    return tag
  }).pipe(Effect.orElseSucceed(() => undefined))
  if (!found) return undefined
  return isUpdate(InstallationVersion, found) ? found : InstallationVersion
})

export const node = LayerNode.make({ service: Service, layer, deps: [] })

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export * as Installation from "."
