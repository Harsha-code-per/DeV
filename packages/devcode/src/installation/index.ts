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

export type Method = "curl" | "npm" | "brew" | "scoop" | "unknown"

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

const Release = Schema.Struct({ tag_name: Schema.String })

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@dev-ai/Installation") {}

export const use = serviceUse(Service)

const layer = Layer.succeed(
  Service,
  Service.of({
    info: Effect.fn("Installation.info")(function* () {
      return { version: InstallationVersion, latest: yield* latestRelease() }
    }),
    method: Effect.fn("Installation.method")(function* () {
      return installMethod()
    }),
    latest: Effect.fn("Installation.latest")(function* () {
      return yield* latestRelease()
    }),
    upgrade: Effect.fn("Installation.upgrade")(function* (method: Method, target: string) {
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
  const parts = fs.realpathSync(process.execPath).split(path.sep)
  if (parts.includes("node_modules")) return "npm"
  if (parts.includes("Cellar")) return "brew"
  if (parts.includes("scoop")) return "scoop"
  return "curl"
}

function upgradeCommand(method: Method, target: string) {
  if (method === "curl") return [process.execPath, "upgrade", target]
  if (method === "npm") return ["npm", "install", "-g", `devcode@${target}`]
  if (method === "brew") return ["brew", "upgrade", "devcode"]
  if (method === "scoop") return ["scoop", "install", `devcode@${target}`]
}

// The installed version when the check fails or nothing newer is published, so callers show no update.
const latestRelease = Effect.fnUntraced(function* () {
  const found = yield* Effect.tryPromise(async () => {
    const response = await fetch("https://api.github.com/repos/Harsha-code-per/DeV/releases/latest", {
      headers: { "User-Agent": `devcode/${InstallationVersion}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return InstallationVersion
    return Schema.decodeUnknownSync(Release)(await response.json()).tag_name.replace(/^v/, "")
  }).pipe(Effect.orElseSucceed(() => InstallationVersion))
  return isUpdate(InstallationVersion, found) ? found : InstallationVersion
})

export const node = LayerNode.make({ service: Service, layer, deps: [] })

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export * as Installation from "."
