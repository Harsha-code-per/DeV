import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { PluginError } from "../groups/plugins"
import { Marketplace } from "@/marketplace"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import { SessionStatus } from "@/session/status"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { Config } from "@/config/config"

export const pluginsHandlers = HttpApiBuilder.group(InstanceHttpApi, "plugins", (handlers) =>
  Effect.gen(function* () {
    const bridge = yield* EffectBridge.make()
    const config = yield* Config.Service

    const run = <A>(fn: () => Promise<A>) =>
      Effect.tryPromise({
        try: fn,
        catch: (error) => new PluginError({ message: error instanceof Error ? error.message : String(error) }),
      })
    const project = Effect.map(InstanceState.context, (ctx) => (ctx.worktree === "/" ? ctx.directory : ctx.worktree))
    // Plugins change commands, agents, skills and MCP servers: reload once running sessions finish, as a
    // settings change does, so work in progress isn't cut off.
    const reload = () =>
      bridge.fork(
        SessionStatus.whenIdle.pipe(Effect.andThen(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))),
      )

    // DeV's own index (and any marketplace the project's config names) is there without adding it by hand.
    const ensure = Effect.gen(function* () {
      const cfg = yield* config.get()
      const root = yield* project
      yield* run(() => Marketplace.ensure(cfg.marketplaces, root))
    })

    const marketplaceInfo = (item: Marketplace.Marketplace) => ({
      name: item.name,
      source: item.source,
      description: item.description,
      owner: item.owner?.name,
      plugins: item.plugins.length,
    })

    return handlers
      .handle("available", () =>
        ensure.pipe(
          Effect.andThen(
            run(async () =>
              (await Marketplace.entries()).map((entry) => ({
                id: `${entry.name}@${entry.marketplace}`,
                name: entry.name,
                marketplace: entry.marketplace,
                description: entry.description,
                version: entry.version,
                category: entry.category,
                tags: [...(entry.tags ?? []), ...(entry.keywords ?? [])].filter((tag) => typeof tag === "string"),
                homepage: entry.homepage,
                license: entry.license,
                author: entry.author?.name,
                kind: entry.metadata?.kind ?? entry.category,
                stars: typeof entry.metadata?.stars === "number" ? entry.metadata.stars : undefined,
                verified: entry.metadata?.verified === true ? true : undefined,
                needs: Array.isArray(entry.metadata?.needs) ? entry.metadata.needs.map(String) : undefined,
              })),
            ),
          ),
        ),
      )
      .handle("installed", () =>
        Effect.gen(function* () {
          const root = yield* project
          // DeV's built-in code plugins (and any npm ones) are listed too, so each can be switched off here.
          return yield* run(async () => [...(await Marketplace.installed(root)), ...(await Marketplace.codePlugins(root))])
        }),
      )
      .handle("marketplaces", () =>
        ensure.pipe(Effect.andThen(run(async () => (await Marketplace.marketplaces()).map(marketplaceInfo)))),
      )
      .handle("marketplaceAdd", (ctx) =>
        Effect.gen(function* () {
          const root = yield* project
          return marketplaceInfo(yield* run(() => Marketplace.addMarketplace(ctx.payload.source, root)))
        }),
      )
      .handle("marketplaceUpdate", (ctx) =>
        run(async () => marketplaceInfo(await Marketplace.updateMarketplace(ctx.params.name))),
      )
      .handle("marketplaceRemove", (ctx) =>
        Effect.gen(function* () {
          yield* run(() => Marketplace.removeMarketplace(ctx.params.name))
          reload()
          return true
        }),
      )
      .handle("install", (ctx) =>
        Effect.gen(function* () {
          const root = yield* project
          const result = yield* run(() => Marketplace.install(ctx.payload.id, ctx.payload.scope, root))
          reload()
          return { id: result.id, message: `Installed ${result.id} (${result.version})`, contents: result.contents }
        }),
      )
      .handle("uninstall", (ctx) =>
        Effect.gen(function* () {
          const root = yield* project
          const id = yield* run(() => Marketplace.uninstall(ctx.payload.id, ctx.payload.scope, root))
          reload()
          return { id, message: `Removed ${id} from ${ctx.payload.scope} scope` }
        }),
      )
      .handle("enable", (ctx) =>
        Effect.gen(function* () {
          const root = yield* project
          const id = yield* run(() =>
            Marketplace.setEnabled(ctx.payload.id, ctx.payload.scope, root, ctx.payload.enabled),
          )
          reload()
          return { id, message: `${ctx.payload.enabled ? "Enabled" : "Disabled"} ${id} in ${ctx.payload.scope} scope` }
        }),
      )
      .handle("update", (ctx) =>
        Effect.gen(function* () {
          const root = yield* project
          const result = yield* run(() => Marketplace.update(ctx.payload.id, root))
          if (result.from !== result.to) reload()
          return {
            id: result.id,
            message:
              result.from === result.to
                ? `${result.id} is up to date`
                : `Updated ${result.id}: ${result.from} → ${result.to}`,
          }
        }),
      )
  }),
)
