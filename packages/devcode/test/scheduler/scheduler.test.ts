import { expect, test } from "bun:test"
import { Scheduler } from "../../src/scheduler"

const at = (iso: string) => new Date(iso)

test("cron expressions match the minutes they should", () => {
  // 2026-10-29 is a Thursday.
  expect(Scheduler.matches("0 9 * * 1-5", at("2026-10-29T09:00:00"))).toBe(true)
  expect(Scheduler.matches("0 9 * * 1-5", at("2026-10-29T09:01:00"))).toBe(false)
  expect(Scheduler.matches("0 9 * * 0,6", at("2026-10-29T09:00:00"))).toBe(false)
  expect(Scheduler.matches("*/15 * * * *", at("2026-10-29T13:45:00"))).toBe(true)
  expect(Scheduler.matches("*/15 * * * *", at("2026-10-29T13:46:00"))).toBe(false)
  expect(Scheduler.matches("30 8 1 * *", at("2026-11-01T08:30:00"))).toBe(true)
  // Sunday is 0 or 7.
  expect(Scheduler.matches("0 10 * * 7", at("2026-11-01T10:00:00"))).toBe(true)
  expect(Scheduler.matches("0 10 * * 0", at("2026-11-01T10:00:00"))).toBe(true)
  expect(Scheduler.matches("not a cron", at("2026-11-01T10:00:00"))).toBe(false)
})

test("a due schedule runs once per minute even with two servers checking", async () => {
  const calls: string[] = []
  const fetch = async (request: Request) => {
    const url = new URL(request.url)
    calls.push(`${request.method} ${url.pathname}`)
    if (url.pathname === "/global/config")
      return Response.json({
        schedules: [
          { name: "brief", cron: "0 9 * * *", prompt: "Morning brief", directory: "/tmp/project" },
          { name: "off", cron: "0 9 * * *", prompt: "x", directory: "/tmp/project", enabled: false },
        ],
      })
    if (url.pathname === "/session") return Response.json({ id: "ses_1" })
    return Response.json(true)
  }
  const now = at("2026-10-29T09:00:00")
  await Scheduler.runDue(fetch, now)
  await Scheduler.runDue(fetch, now)
  expect(calls.filter((call) => call === "POST /session")).toHaveLength(1)
  expect(calls).toContain("POST /session/ses_1/prompt_async")
})
