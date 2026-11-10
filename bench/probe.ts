#!/usr/bin/env bun
// Shows what DeV sends before the person has typed anything useful: runs `devcode run "hi"` against a
// local stand-in for a model, records the request, and prints its size by part (about 4 characters a token).
// Usage: bun bench/probe.ts <devcode binary> <empty profile dir> [context limit]
import { mkdir } from "node:fs/promises"
import path from "node:path"

const [bin, profile, limit = "200000"] = process.argv.slice(2)
if (!bin || !profile) throw new Error("usage: bun bench/probe.ts <devcode binary> <empty profile dir> [context limit]")

const bodies: any[] = []
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    if (request.method !== "POST") return Response.json({ data: [] })
    bodies.push(await request.json())
    const chunk = (delta: object, finish: string | null) =>
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
    return new Response(chunk({ role: "assistant", content: "ok" }, null) + chunk({}, "stop") + "data: [DONE]\n\n", {
      headers: { "content-type": "text/event-stream" },
    })
  },
})

const work = path.join(profile, "work")
await mkdir(path.join(profile, "xdg/config/dev"), { recursive: true })
await mkdir(work, { recursive: true })
await Bun.write(
  path.join(profile, "xdg/config/dev/dev.json"),
  JSON.stringify({
    provider: {
      probe: {
        npm: "@ai-sdk/openai-compatible",
        name: "Probe",
        options: { baseURL: `http://127.0.0.1:${server.port}/v1`, apiKey: "none" },
        models: { m: { name: "m", tool_call: true, limit: { context: Number(limit), output: 8000 } } },
      },
    },
  }),
)

// A new user's environment: nothing inherited from the session that runs this script.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^(CLAUDE|ANTHROPIC|OPENAI|DEV_|OPENCODE|GROQ|GOOGLE|GEMINI)/.test(key)),
)
const proc = Bun.spawn([bin, "run", "--model", "probe/m", "hi"], {
  cwd: work,
  stdin: "ignore",
  stdout: "ignore",
  stderr: "pipe",
  env: {
    ...env,
    PWD: work,
    HOME: path.join(profile, "home"),
    XDG_DATA_HOME: path.join(profile, "xdg/data"),
    XDG_CONFIG_HOME: path.join(profile, "xdg/config"),
    XDG_STATE_HOME: path.join(profile, "xdg/state"),
    XDG_CACHE_HOME: path.join(profile, "xdg/cache"),
  },
})
const timer = setTimeout(() => proc.kill(), 120_000)
const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
clearTimeout(timer)
server.stop(true)

// The main request is the one that carries tools; the title request has none.
const body = bodies.findLast((item) => item.tools?.length) ?? bodies.at(-1)
if (!body) throw new Error(`no request recorded (exit ${code})\n${stderr.slice(-1500)}`)
await Bun.write(path.join(profile, "request.json"), JSON.stringify(body, null, 2))

const text = (content: unknown) =>
  typeof content === "string" ? content : (content as { text?: string }[]).map((part) => part.text ?? "").join("")
const rows: { part: string; chars: number }[] = []
const system = body.messages.filter((m: any) => m.role === "system").map((m: any) => text(m.content)).join("\n")
// Sections of the system text, by the markers DeV writes them with.
const marks: [string, RegExp][] = [
  ["system: skills list", /<available_skills>[\s\S]*?<\/available_skills>/],
  ["system: MCP instructions", /<mcp_instructions>[\s\S]*?<\/mcp_instructions>/],
  ["system: how DeV works with people", /# How DeV works with people[\s\S]*?(?=\n# |\n<|$)/],
  ["system: ponytail plugin", /# Ponytail[\s\S]*?(?=\n<EXTREMELY|\n# How DeV|$)/],
  ["system: superpowers plugin", /<EXTREMELY_IMPORTANT>[\s\S]*?<\/EXTREMELY_IMPORTANT>/],
]
let rest = system
for (const [part, pattern] of marks) {
  const hit = rest.match(pattern)?.[0]
  if (!hit) continue
  rows.push({ part, chars: hit.length })
  rest = rest.replace(hit, "")
}
rows.push({ part: "system: everything else (base prompt, environment, project files)", chars: rest.length })
for (const tool of body.tools ?? [])
  rows.push({ part: `tool: ${tool.function?.name ?? tool.name}`, chars: JSON.stringify(tool).length })
const others = body.messages.filter((m: any) => m.role !== "system")
rows.push({ part: "messages (the word hi, plus what DeV adds to it)", chars: sum(others.map((m: any) => text(m.content ?? "").length)) })

const all = sum(rows.map((row) => row.chars))
console.table(
  rows
    .toSorted((a, b) => b.chars - a.chars)
    .map((row) => ({ part: row.part, tokens: Math.round(row.chars / 4), share: `${Math.round((100 * row.chars) / all)}%` })),
)
const tools = sum(rows.filter((row) => row.part.startsWith("tool:")).map((row) => row.chars))
console.log(`total about ${Math.round(all / 4)} tokens: system ${Math.round(system.length / 4)}, tools ${Math.round(tools / 4)} (${body.tools?.length ?? 0} tools)`)
console.log(`request saved to ${path.join(profile, "request.json")}`)

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0)
}
