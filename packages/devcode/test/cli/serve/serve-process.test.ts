// Subprocess integration tests for `opencode serve`. Spawns the real CLI in
// headless mode and exercises it over HTTP — this is the only test tier that
// catches bugs spanning argv → server boot → routing → instance loading.
//
// `serve` is long-lived: the harness returns a handle (url/port/kill/exited)
// and kills the process when the test scope closes. The OS-assigned port is
// parsed off the "listening on http://..." line.
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { cliIt } from "../../lib/cli-process"

describe("opencode serve (subprocess)", () => {
  // Smoke test: server starts, binds a port, and /global/health responds.
  // If this fails, all other serve tests likely will too — debug here first.
  cliIt.live(
    "starts, binds a port, and serves /global/health",
    ({ opencode }) =>
      Effect.gen(function* () {
        const server = yield* opencode.serve()
        expect(server.port).toBeGreaterThan(0)
        expect(server.url).toMatch(/^http:\/\//)

        const client = yield* HttpClient.HttpClient
        const res = yield* client.get(`${server.url}/global/health`, {
          headers: { authorization: `Basic ${btoa(`dev:${server.password}`)}` },
        })
        expect(res.status).toBe(200)
        // GlobalHealth schema is { success: true, ... } | { success: false, error }.
        // We don't lock in further shape here — any 200 with parseable JSON is
        // enough proof the routing + auth-bypass + instance loading is alive.
        const body = yield* res.json
        expect(body).toBeDefined()
      }),
    60_000,
  )

  // With no DEV_SERVER_PASSWORD, serve must still never run unauthenticated: it binds to
  // loopback by default and generates a password, which it prints with the URL.
  cliIt.live(
    "defaults to loopback and requires a generated password",
    ({ opencode }) =>
      Effect.gen(function* () {
        const server = yield* opencode.serve()
        expect(server.hostname).toBe("127.0.0.1")
        expect(server.password).toMatch(/^[\w-]{43}$/)

        const client = yield* HttpClient.HttpClient
        const anonymous = yield* client.get(`${server.url}/global/health`)
        expect(anonymous.status).toBe(401)
        const wrong = yield* client.get(`${server.url}/global/health`, {
          headers: { authorization: `Basic ${btoa("dev:wrong")}` },
        })
        expect(wrong.status).toBe(401)
        const authorized = yield* client.get(`${server.url}/global/health`, {
          headers: { authorization: `Basic ${btoa(`dev:${server.password}`)}` },
        })
        expect(authorized.status).toBe(200)
      }),
    60_000,
  )

  // A configured password is used as is: nothing is generated or printed.
  cliIt.live(
    "keeps a configured password",
    ({ opencode }) =>
      Effect.gen(function* () {
        const server = yield* opencode.serve({ env: { DEV_SERVER_PASSWORD: "configured-secret" } })
        expect(server.password).toBeUndefined()

        const client = yield* HttpClient.HttpClient
        const res = yield* client.get(`${server.url}/global/health`, {
          headers: { authorization: `Basic ${btoa("dev:configured-secret")}` },
        })
        expect(res.status).toBe(200)
      }),
    60_000,
  )

  // The scope-close finalizer must actually terminate the child. Without this
  // test a regression in the kill path (e.g. a future refactor that forgets
  // to wire the finalizer) would leak processes on every test run.
  cliIt.live(
    "kills the subprocess on scope close",
    ({ opencode }) =>
      Effect.gen(function* () {
        // Inner scope so we can observe `.exited` resolving after it closes.
        const exitedPromise = yield* Effect.scoped(
          Effect.gen(function* () {
            const server = yield* opencode.serve()
            // Capture the Promise, not the resolved value — scope closes after
            // this gen returns, at which point the finalizer kills the child.
            return server.exited
          }),
        )
        // After scope close: finalizer fired, process must have exited.
        const code = yield* Effect.promise(() => exitedPromise)
        // Bun reports the exit code; SIGTERM-killed processes return non-null
        // (typically 143 on POSIX). We just require resolution within a sane
        // window — anything else means the kill didn't take.
        expect(typeof code === "number" || code === null).toBe(true)
      }),
    60_000,
  )
})
