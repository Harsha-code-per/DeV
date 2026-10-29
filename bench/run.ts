#!/usr/bin/env bun
// Runs coding agents on bench/tasks, one at a time, and scores each run with the task's hidden tests.
// Usage: bun bench/run.ts [--agents devcode,claude,codex,none] [--tasks a,b] [--model m] [--timeout min] [--runs n]
import { cp, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"

const ROOT = import.meta.dir
const DEV = path.dirname(ROOT)
const CAPPED = path.join(DEV, "scripts/capped")

const args = parseArgs({
  options: {
    agents: { type: "string", default: "devcode" },
    tasks: { type: "string" },
    model: { type: "string" },
    timeout: { type: "string", default: "10" },
    runs: { type: "string", default: "1" },
  },
}).values

type Report = { tokens?: { input: number; output: number }; cost?: number; message?: string }
type DevEvent = {
  type: string
  part?: {
    text?: string
    cost?: number
    tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  }
}
type ClaudeResult = {
  result?: string
  total_cost_usd?: number
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}
type CodexEvent = { type: string; usage?: { input_tokens: number; output_tokens: number }; item?: { type: string; text?: string } }

const agents: Record<string, { cmd: (prompt: string) => string[]; parse: (stdout: string) => Report }> = {
  // Loads DeV's .env into this process only, so the keys never reach the harness or the other agents.
  devcode: {
    cmd: (prompt) => [
      ...["sh", "-c", 'set -a; [ -f "$0" ] && . "$0"; set +a; exec "$@"', path.join(DEV, ".env")],
      ...["bun", path.join(DEV, "packages/devcode/src/index.ts"), "run", "--format", "json"],
      ...["--permission-mode", "auto", "--model", args.model ?? "auto/free", prompt],
    ],
    parse: (stdout) => {
      const events = jsonLines<DevEvent>(stdout)
      const steps = events.flatMap((e) => (e.type === "step_finish" && e.part?.tokens ? [e.part] : []))
      return {
        tokens: {
          input: sum(steps.map((s) => s.tokens!.input + s.tokens!.cache.read + s.tokens!.cache.write)),
          output: sum(steps.map((s) => s.tokens!.output + s.tokens!.reasoning)),
        },
        cost: sum(steps.map((s) => s.cost ?? 0)),
        message: events.findLast((e) => e.type === "text")?.part?.text,
      }
    },
  },
  claude: {
    cmd: (prompt) => [
      ...["claude", "-p", "--dangerously-skip-permissions", "--output-format", "json"],
      ...(args.model ? ["--model", args.model] : []),
      prompt,
    ],
    parse: (stdout) => {
      const result = json<ClaudeResult>(stdout.trim())
      if (!result?.usage) return {}
      return {
        tokens: {
          input:
            result.usage.input_tokens +
            (result.usage.cache_creation_input_tokens ?? 0) +
            (result.usage.cache_read_input_tokens ?? 0),
          output: result.usage.output_tokens,
        },
        cost: result.total_cost_usd,
        message: result.result,
      }
    },
  },
  // Codex reports tokens but not cost. `exec` never asks for approval; workspace-write lets it edit the copy.
  codex: {
    cmd: (prompt) => [
      ...["codex", "exec", "--json", "--sandbox", "workspace-write"],
      ...(args.model ? ["--model", args.model] : []),
      prompt,
    ],
    parse: (stdout) => {
      const events = jsonLines<CodexEvent>(stdout)
      const turns = events.flatMap((e) => (e.type === "turn.completed" && e.usage ? [e.usage] : []))
      return {
        tokens: { input: sum(turns.map((u) => u.input_tokens)), output: sum(turns.map((u) => u.output_tokens)) },
        message: events.findLast((e) => e.item?.type === "agent_message")?.item?.text,
      }
    },
  },
  // Does nothing: every task must fail with it, which proves the hidden tests are not already passing.
  none: { cmd: () => ["true"], parse: () => ({}) },
}

const runID = new Date().toISOString().replace(/[:.]/g, "-")
const agentNames = args.agents.split(",")
const unknown = agentNames.filter((name) => !agents[name])
if (unknown.length) throw new Error(`unknown agent(s): ${unknown.join(", ")}`)
const taskIDs = args.tasks?.split(",") ?? (await readdir(path.join(ROOT, "tasks"))).sort()
const timeoutSeconds = Number(args.timeout) * 60

const results = []
// ponytail: strictly sequential; this machine cannot run several agents at once.
for (const agent of agentNames)
  for (const task of taskIDs)
    for (let n = 1; n <= Number(args.runs); n++) {
      console.error(`[bench] ${agent} ${task} #${n}`)
      results.push(await run(agent, task, n))
    }

const file = path.join(ROOT, "results", `${runID}.json`)
await Bun.write(file, JSON.stringify({ runID, model: args.model, timeoutSeconds, results }, null, 2) + "\n")
await rm(path.join("/var/tmp/dev-bench", runID), { recursive: true, force: true })

console.table(
  results.map((r) => ({
    agent: r.agent,
    task: r.task,
    run: r.run,
    pass: r.pass,
    seconds: r.seconds,
    exit: r.exitCode,
    tokens: r.tokens ? r.tokens.input + r.tokens.output : "",
    cost: r.cost ?? "",
  })),
)
agentNames.forEach((agent) => {
  const mine = results.filter((r) => r.agent === agent)
  console.log(`${agent}: ${mine.filter((r) => r.pass).length}/${mine.length} passed`)
})
console.log(`results: ${file}`)

async function run(agent: string, task: string, n: number) {
  const taskDir = path.join(ROOT, "tasks", task)
  const dir = path.join("/var/tmp/dev-bench", runID, agent, `${task}-${n}`)
  await cp(path.join(taskDir, "repo"), dir, { recursive: true })
  await exec(["git", "init", "-q"], dir)
  await exec(["git", "add", "-A"], dir)
  await exec(["git", "-c", "user.name=bench", "-c", "user.email=bench@localhost", "commit", "-qm", "start"], dir)

  const prompt = await Bun.file(path.join(taskDir, "task.md")).text()
  const start = performance.now()
  // `timeout` signals its whole process group, so tools the agent spawned die with it.
  const agentRun = await exec(
    ["timeout", "-k", "10", String(timeoutSeconds), CAPPED, "3G", "--", ...agents[agent].cmd(prompt)],
    dir,
  )
  const seconds = Math.round((performance.now() - start) / 100) / 10

  // Hidden files overwrite anything the agent wrote at the same path, including edited tests.
  const hidden = await readdir(path.join(taskDir, "hidden"))
  await cp(path.join(taskDir, "hidden"), dir, { recursive: true, force: true })
  const ts = hidden.filter((f) => f.endsWith(".ts")).map((f) => `./${f}`)
  const py = hidden.filter((f) => f.endsWith(".py"))
  const checks = [ts.length ? ["bun", "test", ...ts] : [], py.length ? ["python3", "-m", "unittest", ...py] : []]
  const tests = []
  for (const check of checks.filter((c) => c.length))
    tests.push(await exec(["timeout", "-k", "5", "120", CAPPED, "3G", "--", ...check], dir))

  return {
    agent,
    task,
    run: n,
    pass: tests.length > 0 && tests.every((t) => t.code === 0),
    seconds,
    exitCode: agentRun.code,
    timedOut: agentRun.code === 124,
    ...agents[agent].parse(agentRun.stdout),
    agentStderr: agentRun.code === 0 ? undefined : agentRun.stderr.slice(-2000),
    testOutput: tests.map((t) => (t.stdout + t.stderr).slice(-2000)).join("\n"),
  }
}

async function exec(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, code }
}

function jsonLines<T>(text: string) {
  return text.split("\n").flatMap((line) => json<T>(line) ?? [])
}

function json<T>(text: string): T | undefined {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0)
}
