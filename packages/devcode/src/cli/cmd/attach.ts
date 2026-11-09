import { cmd } from "./cmd"
import { UI } from "@/cli/ui"
import { errorMessage } from "@dev-ai/tui/util/error"
import { validateSession } from "../tui/validate-session"
import { ServerAuth } from "@/server/auth"

export const AttachCommand = cmd({
  command: "attach [url]",
  describe: "attach to a running DeV Code server, or without a url to your background sessions (devcode run --bg)",
  builder: (yargs) =>
    yargs
      .positional("url", {
        type: "string",
        describe: "http://localhost:4096; omit it for the background server",
      })
      .option("dir", {
        type: "string",
        description: "directory to run in",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork the session when continuing (use with --continue or --session)",
      })
      .option("password", {
        alias: ["p"],
        type: "string",
        describe: "basic auth password (defaults to DEV_SERVER_PASSWORD)",
      })
      .option("username", {
        alias: ["u"],
        type: "string",
        describe: "basic auth username (defaults to DEV_SERVER_USERNAME or 'dev')",
      })
      .option("mini", {
        type: "boolean",
        describe: "start the minimal interactive interface",
        default: false,
      })
      .option("replay", {
        type: "boolean",
        hidden: true,
      })
      .option("no-replay", {
        type: "boolean",
        describe: "disable mini session history replay on resume and after resize",
      })
      .option("replay-limit", {
        type: "number",
        describe: "cap visible mini replay to the newest N messages",
      }),
  handler: async (args) => {
    if (args.replay === true) {
      UI.error("--replay is not supported; replay is enabled by default")
      process.exitCode = 1
      return
    }
    const noReplay = args.replay === false || args.noReplay === true

    // No url: the background server that `devcode run --bg` started, with its own password.
    const background = args.url ? undefined : await import("../background").then((mod) => mod.Background.find())
    if (!args.url && !background) {
      UI.error("No background sessions are running. Start one with `devcode run --bg \"your task\"`, or give a server url.")
      process.exitCode = 1
      return
    }
    const url = args.url ?? background!.url
    const password = args.password ?? background?.password

    const directory = (() => {
      if (!args.dir) return undefined
      try {
        process.chdir(args.dir)
        return process.cwd()
      } catch {
        // If the directory doesn't exist locally (remote attach), pass it through.
        return args.dir
      }
    })() ?? (background ? process.cwd() : undefined)

    if (args.mini) {
      const { runMini } = await import("./run")
      await runMini({
        attach: url,
        directory,
        password,
        username: args.username,
        continue: args.continue,
        session: args.session,
        fork: args.fork,
        replay: noReplay ? false : undefined,
        replayLimit: args.replayLimit,
      })
      return
    }

    const unsupported = [
      ["--no-replay", noReplay],
      ["--replay-limit", args.replayLimit !== undefined],
    ].find((entry) => entry[1])?.[0]
    if (unsupported) {
      UI.error(`${unsupported} requires --mini`)
      process.exitCode = 1
      return
    }

    const { TuiConfig } = await import("@/config/tui")
    if (args.fork && !args.continue && !args.session) {
      UI.error("--fork requires --continue or --session")
      process.exitCode = 1
      return
    }

    const headers = ServerAuth.headers({ password, username: args.username })
    const config = await TuiConfig.get()

    try {
      await validateSession({
        url,
        sessionID: args.session,
        directory,
        headers,
      })
    } catch (error) {
      UI.error(errorMessage(error))
      process.exitCode = 1
      return
    }

    const { Effect } = await import("effect")
    const { run } = await import("../tui/layer")
    const { createLegacyTuiPluginHost } = await import("@/plugin/tui/runtime")
    await Effect.runPromise(
      run({
        url,
        config,
        pluginHost: createLegacyTuiPluginHost(),
        args: {
          continue: args.continue,
          sessionID: args.session,
          fork: args.fork,
        },
        directory,
        headers,
      }),
    )
  },
})
