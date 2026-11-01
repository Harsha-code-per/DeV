export * as Database from "./database"

import { EffectDrizzleSqlite } from "@dev-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { existsSync, renameSync } from "fs"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@dev-ai/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

export function path() {
  if (Flag.DEV_DB) {
    if (Flag.DEV_DB === ":memory:" || isAbsolute(Flag.DEV_DB)) return Flag.DEV_DB
    return join(Global.Path.data, Flag.DEV_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.DEV_DISABLE_CHANNEL_DB === "1" ||
    process.env.DEV_DISABLE_CHANNEL_DB === "true"
  )
    return adopt(Global.Path.data, "dev.db", "opencode.db")
  const channel = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")
  return adopt(Global.Path.data, `dev-${channel}.db`, `opencode-${channel}.db`)
}

// Sessions saved under the old name move over the first time the new one is needed.
export function adopt(dir: string, name: string, legacy: string) {
  const file = join(dir, name)
  const old = join(dir, legacy)
  if (existsSync(file) || !existsSync(old)) return file
  ;["", "-wal", "-shm"]
    .filter((suffix) => existsSync(old + suffix))
    .forEach((suffix) => renameSync(old + suffix, file + suffix))
  return file
}

// Resolved when the layer is built, not at import, so a changed Flag.DEV_DB (embedded hosts, tests) takes effect.
export const node = makeGlobalNode({
  service: Service,
  layer: Layer.unwrap(Effect.sync(() => layerFromPath(path()))),
  deps: [],
})
