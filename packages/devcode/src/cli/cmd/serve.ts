import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { ServerAuth } from "@/server/auth"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless dev server",
  // Server loads instances per-request via x-dev-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    const opts = yield* resolveNetworkOptions(args)
    const password = ServerAuth.ensurePassword()
    const server = yield* Effect.promise(() => Server.listen(opts))
    // Printed before the listening line, which scripts wait for.
    if (password) {
      console.log(`Username: ${ServerAuth.displayUsername()}`)
      console.log(`Password: ${password}  (generated; set DEV_SERVER_PASSWORD to choose your own)`)
    }
    console.log(`DeV Code server listening on http://${server.hostname}:${server.port}`)
    const { Scheduler } = yield* Effect.promise(() => import("../../scheduler"))
    Scheduler.start(Server.Default().app.fetch)

    yield* Effect.never
  }),
})
