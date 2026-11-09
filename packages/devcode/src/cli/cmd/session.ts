import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { Session } from "@/session/session"
import { SessionID } from "../../session/schema"
import { UI } from "../ui"
import { Locale } from "@/util/locale"
import { Flag } from "@dev-ai/core/flag/flag"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { NotFoundError } from "@/storage/storage"
import { EOL } from "os"
import path from "path"
import { which } from "@dev-ai/core/util/which"

function pagerCmd(): string[] {
  const lessOptions = ["-R", "-S"]
  if (process.platform !== "win32") {
    return ["less", ...lessOptions]
  }

  // user could have less installed via other options
  const lessOnPath = which("less")
  if (lessOnPath) {
    if (Filesystem.stat(lessOnPath)?.size) return [lessOnPath, ...lessOptions]
  }

  if (Flag.DEV_GIT_BASH_PATH) {
    const less = path.join(Flag.DEV_GIT_BASH_PATH, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  const git = which("git")
  if (git) {
    const less = path.join(git, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  // Fall back to Windows built-in more (via cmd.exe)
  return ["cmd", "/c", "more"]
}

export const SessionCommand = cmd({
  command: "session",
  describe: "manage sessions",
  builder: (yargs: Argv) => yargs.command(SessionListCommand).command(SessionDeleteCommand).demandCommand(),
  async handler() {},
})

export const SessionDeleteCommand = effectCmd({
  command: "delete <sessionID>",
  describe: "delete a session",
  builder: (yargs) =>
    yargs.positional("sessionID", {
      describe: "session ID to delete",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.session.delete")(function* (args) {
    const svc = yield* Session.Service
    const sessionID = SessionID.make(args.sessionID)
    yield* svc
      .remove(sessionID)
      .pipe(Effect.catchIf(NotFoundError.isInstance, () => fail(`Session not found: ${args.sessionID}`)))
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Session ${args.sessionID} deleted` + UI.Style.TEXT_NORMAL)
  }),
})

export const SessionListCommand = effectCmd({
  command: "list",
  describe: "list sessions",
  builder: (yargs) =>
    yargs
      .option("max-count", {
        alias: "n",
        describe: "limit to N most recent sessions",
        type: "number",
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      })
      .option("running", {
        describe: "only sessions working or waiting for you in the background (devcode run --bg)",
        type: "boolean",
        default: false,
      }),
  handler: Effect.fn("Cli.session.list")(function* (args) {
    const all = yield* Session.Service.use((svc) => svc.list({ roots: true, limit: args.running ? undefined : args.maxCount }))
    const live = yield* Effect.promise(() => liveStatus(process.cwd()))
    const sessions = args.running ? all.filter((session) => live.has(session.id)) : all

    if (sessions.length === 0) {
      if (args.running) console.log("Nothing is running in the background.")
      return
    }

    const output = args.format === "json" ? formatSessionJSON(sessions, live) : formatSessionTable(sessions, live)

    const shouldPaginate = process.stdout.isTTY && !args.maxCount && args.format === "table"

    if (shouldPaginate) {
      yield* Effect.promise(async () => {
        const proc = Process.spawn(pagerCmd(), {
          stdin: "pipe",
          stdout: "inherit",
          stderr: "inherit",
        })

        if (!proc.stdin) {
          console.log(output)
          return
        }

        proc.stdin.write(output)
        proc.stdin.end()
        await proc.exited
      })
    } else {
      console.log(output)
    }
  }),
})

/**
 * What the background server (devcode run --bg) is doing right now: "working", or "needs you" when a permission
 * prompt is waiting. Empty when no background server is running.
 */
async function liveStatus(directory: string) {
  const { Background } = await import("../background")
  const server = await Background.find()
  const live = new Map<string, string>()
  if (!server) return live
  const { createDevcodeClient } = await import("@dev-ai/sdk/v2")
  const sdk = createDevcodeClient({ baseUrl: server.url, directory, headers: Background.headers(server) })
  const [statuses, waiting] = await Promise.all([
    sdk.session.status().then((result) => result.data ?? {}).catch(() => ({})),
    sdk.permission.list().then((result) => result.data ?? []).catch(() => []),
  ])
  for (const [id, status] of Object.entries(statuses)) if (status.type !== "idle") live.set(id, "working")
  for (const request of waiting) live.set(request.sessionID, "needs you")
  return live
}

function formatSessionTable(sessions: Session.Info[], live: Map<string, string>): string {
  const lines: string[] = []

  const maxIdWidth = Math.max(20, ...sessions.map((s) => s.id.length))
  const maxTitleWidth = Math.max(25, ...sessions.map((s) => s.title.length))
  const status = (session: Session.Info) => (live.size > 0 ? `  ${(live.get(session.id) ?? "").padEnd(9)}` : "")

  const header = `Session ID${" ".repeat(maxIdWidth - 10)}  Title${" ".repeat(maxTitleWidth - 5)}${live.size > 0 ? "  Status   " : ""}  Updated`
  lines.push(header)
  lines.push("─".repeat(header.length))
  for (const session of sessions) {
    const truncatedTitle = Locale.truncate(session.title, maxTitleWidth)
    const timeStr = Locale.todayTimeOrDateTime(session.time.updated)
    const line = `${session.id.padEnd(maxIdWidth)}  ${truncatedTitle.padEnd(maxTitleWidth)}${status(session)}  ${timeStr}`
    lines.push(line)
  }

  return lines.join(EOL)
}

function formatSessionJSON(sessions: Session.Info[], live: Map<string, string>): string {
  const jsonData = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    ...(live.has(session.id) ? { status: live.get(session.id) } : {}),
    updated: session.time.updated,
    created: session.time.created,
    projectId: session.projectID,
    directory: session.directory,
  }))
  return JSON.stringify(jsonData, null, 2)
}
