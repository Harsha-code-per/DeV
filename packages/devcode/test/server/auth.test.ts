import { afterEach, describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { Flag } from "@dev-ai/core/flag/flag"
import { ServerAuth } from "../../src/server/auth"

const original = {
  DEV_SERVER_PASSWORD: Flag.DEV_SERVER_PASSWORD,
  DEV_SERVER_USERNAME: Flag.DEV_SERVER_USERNAME,
}

afterEach(() => {
  Flag.DEV_SERVER_PASSWORD = original.DEV_SERVER_PASSWORD
  Flag.DEV_SERVER_USERNAME = original.DEV_SERVER_USERNAME
})

describe("ServerAuth", () => {
  test("does not emit auth headers without a password", () => {
    Flag.DEV_SERVER_PASSWORD = undefined
    Flag.DEV_SERVER_USERNAME = "alice"

    expect(ServerAuth.header()).toBeUndefined()
    expect(ServerAuth.headers()).toBeUndefined()
  })

  test("defaults to the devcode username", () => {
    Flag.DEV_SERVER_PASSWORD = "secret"
    Flag.DEV_SERVER_USERNAME = undefined

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("devcode:secret").toString("base64")}`,
    })
  })

  test("uses the configured username", () => {
    Flag.DEV_SERVER_PASSWORD = "secret"
    Flag.DEV_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    })
  })

  test("prefers explicit credentials", () => {
    Flag.DEV_SERVER_PASSWORD = "secret"
    Flag.DEV_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers({ password: "cli-secret", username: "bob" })).toEqual({
      Authorization: `Basic ${Buffer.from("bob:cli-secret").toString("base64")}`,
    })
  })

  test("validates decoded credentials against effect config", () => {
    const config = { password: Option.some("secret"), username: "alice" }

    expect(ServerAuth.required(config)).toBe(true)
    expect(ServerAuth.authorized({ username: "alice", password: Redacted.make("secret") }, config)).toBe(true)
    expect(ServerAuth.authorized({ username: "devcode", password: Redacted.make("secret") }, config)).toBe(false)
  })

  test("accepts dev as the default username only when none is configured", () => {
    Flag.DEV_SERVER_USERNAME = undefined
    const defaulted = { password: Option.some("secret"), username: "devcode" }
    expect(ServerAuth.authorized({ username: "dev", password: Redacted.make("secret") }, defaulted)).toBe(true)
    expect(ServerAuth.authorized({ username: "devcode", password: Redacted.make("secret") }, defaulted)).toBe(true)
    expect(ServerAuth.authorized({ username: "dev", password: Redacted.make("wrong") }, defaulted)).toBe(false)

    Flag.DEV_SERVER_USERNAME = "devcode"
    expect(ServerAuth.authorized({ username: "dev", password: Redacted.make("secret") }, defaulted)).toBe(false)
  })
})
