export * as ServerAuth from "./auth"

import { ConfigService } from "@/effect/config-service"
import { Flag } from "@dev-ai/core/flag/flag"
import { Config as EffectConfig, Context, Option, Redacted } from "effect"
import { randomBytes } from "node:crypto"

export type Credentials = {
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export class Config extends ConfigService.Service<Config>()("@dev-ai/ServerAuthConfig", {
  password: EffectConfig.string("DEV_SERVER_PASSWORD").pipe(EffectConfig.option),
  username: EffectConfig.string("DEV_SERVER_USERNAME").pipe(EffectConfig.withDefault("opencode")),
}) {}

export type Info = Context.Service.Shape<typeof Config>

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    (credentials.username === config.username || defaultAlias(credentials.username, config)) &&
    Redacted.value(credentials.password) === config.password.value
  )
}

// With no username configured, DeV's name "dev" is accepted next to the built-in default, which
// existing clients (web app, desktop) still send.
function defaultAlias(username: string, config: Info) {
  return username === "dev" && config.username === "opencode" && Flag.DEV_SERVER_USERNAME === undefined
}

// A listening server is never unauthenticated: with no password configured, generate one and publish it
// through the env, which each listener's auth config reads and the TUI worker inherits. Returns the
// generated password so the caller can show it; undefined when one was already configured.
export function ensurePassword() {
  if (process.env.DEV_SERVER_PASSWORD || Flag.DEV_SERVER_PASSWORD) return undefined
  const password = randomBytes(32).toString("base64url")
  process.env.DEV_SERVER_PASSWORD = password
  Flag.DEV_SERVER_PASSWORD = password
  return password
}

// The username to show next to a generated password: "dev" is accepted as the default username.
export function displayUsername() {
  return Flag.DEV_SERVER_USERNAME ?? "dev"
}

export function header(credentials?: Credentials) {
  const password = credentials?.password ?? Flag.DEV_SERVER_PASSWORD
  if (!password) return undefined

  const username = credentials?.username ?? Flag.DEV_SERVER_USERNAME ?? "opencode"
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export function headers(credentials?: Credentials) {
  const authorization = header(credentials)
  if (!authorization) return undefined
  return { Authorization: authorization }
}
