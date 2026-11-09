import { spawn } from "child_process"
import { randomBytes } from "crypto"
import fs from "fs/promises"
import net from "net"
import path from "path"
import { Global } from "@dev-ai/core/global"
import { ServerAuth } from "@/server/auth"

// Background sessions (`devcode run --bg`) run in one DeV server per user that outlives the terminal that started
// it. Its address and a random password live in a state file only the user can read; `attach` and `session list`
// find it there. It exits after IDLE_MINUTES with nothing working and no prompt waiting, so it doesn't hold memory.

type Info = { url: string; password: string; pid: number }

// DEV_BACKGROUND_IDLE_MINUTES changes it, e.g. to keep the server warm longer.
const IDLE_MINUTES = Number(process.env.DEV_BACKGROUND_IDLE_MINUTES ?? 30)

const file = () => path.join(Global.Path.state, "background.json")

/** The running background server, or undefined when there is none. */
export async function find() {
  const info = await fs
    .readFile(file(), "utf8")
    .then((text) => JSON.parse(text) as Info)
    .catch(() => undefined)
  if (!info || !(await healthy(info))) return undefined
  return info
}

/** The running background server, starting one when needed. */
export async function ensure() {
  const running = await find()
  if (running) return running
  const password = randomBytes(32).toString("base64url")
  const port = await freePort()
  await fs.mkdir(Global.Path.state, { recursive: true })
  const log = await fs.open(path.join(Global.Path.state, "background.log"), "a")
  // A compiled binary is DeV itself; from source, Bun runs this entry script.
  const command = import.meta.path.startsWith("/$bunfs/") ? [process.execPath] : [process.execPath, process.argv[1]!]
  const child = spawn(command[0]!, [...command.slice(1), "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    env: { ...process.env, DEV_SERVER_PASSWORD: password, DEV_BACKGROUND: "1" },
  })
  child.unref()
  await log.close()
  const info = { url: `http://127.0.0.1:${port}`, password, pid: child.pid ?? 0 }
  for (let i = 0; i < 100; i++) {
    if (await healthy(info)) {
      await fs.writeFile(file(), JSON.stringify(info), { mode: 0o600 })
      return info
    }
    await Bun.sleep(200)
  }
  throw new Error(`The background server didn't start; see ${path.join(Global.Path.state, "background.log")}`)
}

/**
 * In the background server: exit once no session is working and no permission prompt is waiting for IDLE_MINUTES.
 * ponytail: tracks events from this process start; a restart forgets nothing that matters, since work restarts it.
 */
export async function exitWhenIdle() {
  const { GlobalBus } = await import("@/bus/global")
  const busy = new Set<string>()
  const waiting = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = () => {
    clearTimeout(timer)
    if (busy.size === 0 && waiting.size === 0) timer = setTimeout(() => process.exit(0), IDLE_MINUTES * 60_000)
  }
  GlobalBus.on("event", (event) => {
    const payload = event.payload as { type?: string; properties?: Record<string, any> } | undefined
    const props = payload?.properties
    if (payload?.type === "session.status" && props?.sessionID) {
      if (props.status?.type === "idle") busy.delete(props.sessionID)
      else busy.add(props.sessionID)
    }
    if (payload?.type === "permission.asked" && props?.id) waiting.add(props.id)
    if (payload?.type === "permission.replied" && props?.requestID) waiting.delete(props.requestID)
    check()
  })
  check()
}

export function headers(info: Info) {
  return ServerAuth.headers({ password: info.password })
}

async function healthy(info: Info) {
  return fetch(`${info.url}/global/health`, { headers: headers(info), signal: AbortSignal.timeout(2000) })
    .then((response) => response.ok)
    .catch(() => false)
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no free port"))))
    })
  })
}

export * as Background from "./background"
