import fs from "fs/promises"
import path from "path"
import { Global } from "@dev-ai/core/global"
import { ServerAuth } from "@/server/auth"

// Scheduled prompts: `schedules` in the global dev.json runs a prompt on a cron schedule in a project,
// in a new session, while any DeV server is running (dev serve, the TUI or the desktop app). It drives the
// server through its own API, like the TUI worker. A lock file per run keeps two running servers from
// running the same schedule twice.
// ponytail: checks once a minute; a missed minute (machine asleep) is skipped, not caught up.

export type Schedule = {
  name: string
  cron: string
  prompt: string
  directory: string
  model?: string
  agent?: string
  enabled?: boolean
}

type Fetch = (request: Request) => Response | Promise<Response>

function auth(): Record<string, string> {
  const header = ServerAuth.header()
  return header ? { Authorization: header } : {}
}

/** Starts checking every minute; returns a stop function. */
export function start(fetch: Fetch) {
  const tick = () =>
    void runDue(fetch, new Date()).catch((error) => console.error(`DeV scheduler: ${String(error)}`))
  // Align to the start of the next minute, then every minute.
  const first = setTimeout(
    () => {
      tick()
      timer = setInterval(tick, 60_000)
      timer.unref?.()
    },
    60_000 - (Date.now() % 60_000),
  )
  first.unref?.()
  let timer: ReturnType<typeof setInterval> | undefined
  return () => {
    clearTimeout(first)
    if (timer) clearInterval(timer)
  }
}

export async function runDue(fetch: Fetch, now: Date) {
  const request = async (url: string, init?: RequestInit) =>
    fetch(
      new Request(new URL(url, "http://localhost"), {
        ...init,
        headers: { "content-type": "application/json", ...auth() },
      }),
    )
  const config = (await request("/global/config").then((res) => res.json())) as { schedules?: Schedule[] }
  const due = (config.schedules ?? []).filter((item) => item.enabled !== false && matches(item.cron, now))
  for (const item of due) {
    if (!(await claim(item.name, now))) continue
    const query = `?directory=${encodeURIComponent(item.directory)}`
    const session = (await request(`/session${query}`, {
      method: "POST",
      body: JSON.stringify({ title: `Scheduled: ${item.name}` }),
    }).then((res) => res.json())) as { id: string }
    const model = item.model?.includes("/")
      ? {
          providerID: item.model.slice(0, item.model.indexOf("/")),
          modelID: item.model.slice(item.model.indexOf("/") + 1),
        }
      : undefined
    await request(`/session/${session.id}/prompt_async${query}`, {
      method: "POST",
      body: JSON.stringify({ parts: [{ type: "text", text: item.prompt }], model, agent: item.agent }),
    })
  }
}

/** Whether a 5-field cron expression (minute hour day-of-month month day-of-week) matches this minute. */
export function matches(cron: string, date: Date) {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()]
  const ranges: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ]
  return fields.every((field, index) =>
    field.split(",").some((part) => {
      // Day of week: Sunday is both 0 and 7.
      const candidates = index === 4 && values[index] === 0 ? [0, 7] : [values[index]]
      return candidates.some((value) => fieldMatches(part, value, ranges[index]))
    }),
  )
}

function fieldMatches(part: string, value: number, [min, max]: [number, number]) {
  const [range, stepText] = part.split("/")
  const step = stepText ? Number(stepText) : 1
  if (!Number.isInteger(step) || step < 1) return false
  const [from, to] =
    range === "*"
      ? [min, max]
      : range.includes("-")
        ? range.split("-").map(Number)
        : [Number(range), stepText ? max : Number(range)]
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false
  return value >= from && value <= to && (value - from) % step === 0
}

// One lock file per schedule and minute; the first server to create it runs the schedule.
async function claim(name: string, now: Date) {
  const dir = path.join(Global.Path.state, "schedules")
  await fs.mkdir(dir, { recursive: true })
  const minute = now
    .toISOString()
    .slice(0, 16)
    .replace(/[^0-9]/g, "")
  const file = path.join(dir, `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}-${minute}.lock`)
  const claimed = await fs.writeFile(file, String(process.pid), { flag: "wx" }).then(
    () => true,
    () => false,
  )
  // Locks older than a day are no longer needed.
  const cutoff = Date.now() - 86_400_000
  const entries = await fs.readdir(dir).catch(() => [])
  await Promise.all(
    entries.map(async (entry) => {
      const stat = await fs.stat(path.join(dir, entry)).catch(() => undefined)
      if (stat && stat.mtimeMs < cutoff) await fs.rm(path.join(dir, entry), { force: true })
    }),
  )
  return claimed
}

export * as Scheduler from "."
