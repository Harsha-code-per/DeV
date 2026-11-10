#!/usr/bin/env bun
// Runs coding agents on bench/tasks, one at a time, and scores each run with the task's hidden tests.
// Usage: bun bench/run.ts [--agents devcode,none] [--tasks a,b] [--model m] [--timeout min] [--runs n]
import { cp, readdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

const ROOT = import.meta.dir
const DEV = path.dirname(ROOT)
// BENCH_NO_CAP=1 runs without the memory cap, for machines without a systemd user session (CI runners).
const CAPPED = process.env["BENCH_NO_CAP"] ? [] : [path.join(DEV, "scripts/capped"), "3G", "--"]

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
// first: the task itself. warm and cold: a task's follow-up, with and without the first run behind it.
type Phase = "first" | "warm" | "cold"

const agents: Record<string, { cmd: (prompt: string) => string[]; parse: (stdout: string) => Report }> = {
  // The installed binary with a stored login, exactly what a user runs. Never source or .env.
  devcode: {
    cmd: (prompt) => [
      ...["devcode", "run", "--format", "json"],
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
  // Does nothing: every task must fail with it, which proves the hidden tests are not already passing.
  none: { cmd: () => ["true"], parse: () => ({}) },
}

const runID = new Date().toISOString().replace(/[:.]/g, "-")
const agentNames = args.agents.split(",")
const unknown = agentNames.filter((name) => !agents[name])
if (unknown.length) throw new Error(`unknown agent(s): ${unknown.join(", ")}`)
const taskIDs = args.tasks?.split(",") ?? (await readdir(path.join(ROOT, "tasks"))).sort()
const timeoutSeconds = Number(args.timeout) * 60

const results: Awaited<ReturnType<typeof attempt>>[] = []
// ponytail: strictly sequential; this machine cannot run several agents at once.
for (const agent of agentNames)
  for (const task of taskIDs)
    for (let n = 1; n <= Number(args.runs); n++) {
      console.error(`[bench] ${agent} ${task} #${n}`)
      results.push(...(await run(agent, task, n)))
    }

const file = path.join(ROOT, "results", `${runID}.json`)
await Bun.write(file, JSON.stringify({ runID, model: args.model, timeoutSeconds, results }, null, 2) + "\n")
await rm(path.join("/var/tmp/dev-bench", runID), { recursive: true, force: true })

console.table(
  results.map((r) => ({
    agent: r.agent,
    task: r.task,
    run: r.run,
    phase: r.phase,
    pass: r.pass,
    seconds: r.seconds,
    exit: r.exitCode,
    tokens: total(r) || "",
    cost: r.cost ?? "",
  })),
)
agentNames.forEach((agent) => {
  const mine = results.filter((r) => r.agent === agent)
  const warm = mine.filter((r) => r.phase === "warm")
  const cold = mine.filter((r) => r.phase === "cold")
  // The headline score is the plain tasks, so it stays comparable as learning tasks are added.
  const first = mine.filter((r) => r.phase === "first" && !warm.some((w) => w.task === r.task))
  const solved = first.filter((r) => r.pass)
  console.log(`${agent}: ${solved.length}/${first.length} passed`)
  if (solved.length)
    console.log(
      `${agent}: median ${median(solved.map((r) => r.seconds))}s and ${median(solved.map(total))} tokens per solved task`,
    )
  // The same follow-up on the same code: warm has worked in the project before, cold has not.
  if (warm.length)
    console.log(
      `${agent} learning: warm ${warm.filter((r) => r.pass).length}/${warm.length} (median ${median(warm.map(total))} tokens), ` +
        `cold ${cold.filter((r) => r.pass).length}/${cold.length} (median ${median(cold.map(total))} tokens)`,
    )
})
console.log(`results: ${file}`)

async function run(agent: string, task: string, n: number) {
  const taskDir = path.join(ROOT, "tasks", task)
  const dir = path.join("/var/tmp/dev-bench", runID, agent, `${task}-${n}`)
  await prepare(taskDir, dir)
  const first = await attempt({ agent, task, n, phase: "first", taskDir, dir, prompt: "task.md", hidden: "hidden" })
  if (!existsSync(path.join(taskDir, "followup.md"))) return [first]

  // Both follow-up runs start from the reference solution, so the code is identical and the only
  // difference is what the agent kept from its first run (its memory, and notes it left in the project).
  await solve(taskDir, dir)
  const followup = { agent, task, n, taskDir, prompt: "followup.md", hidden: "hidden-followup" }
  const warm = await attempt({ ...followup, phase: "warm", dir })
  await prepare(taskDir, `${dir}-cold`)
  await solve(taskDir, `${dir}-cold`)
  return [first, warm, await attempt({ ...followup, phase: "cold", dir: `${dir}-cold` })]
}

/** A fresh git repository holding the task's project. setup.sh, if the task has one, builds its history. */
async function prepare(taskDir: string, dir: string) {
  await cp(path.join(taskDir, "repo"), dir, { recursive: true })
  await exec(["git", "init", "-q"], dir)
  if (existsSync(path.join(taskDir, "setup.sh"))) await exec(["sh", path.join(taskDir, "setup.sh")], dir)
  await commit(dir, "start")
}

async function solve(taskDir: string, dir: string) {
  await cp(path.join(taskDir, "solution"), dir, { recursive: true, force: true })
  await commit(dir, "first task done")
}

async function commit(dir: string, message: string) {
  await exec(["git", "add", "-A"], dir)
  await exec(
    [...["git", "-c", "user.name=bench", "-c", "user.email=bench@localhost"], "commit", "--allow-empty", "-qm", message],
    dir,
  )
}

async function attempt(input: {
  agent: string
  task: string
  n: number
  phase: Phase
  taskDir: string
  dir: string
  prompt: string
  hidden: string
}) {
  const prompt = await Bun.file(path.join(input.taskDir, input.prompt)).text()
  const start = performance.now()
  // `timeout` signals its whole process group, so tools the agent spawned die with it.
  const agentRun = await exec(
    ["timeout", "-k", "10", String(timeoutSeconds), ...CAPPED, ...agents[input.agent].cmd(prompt)],
    input.dir,
  )
  const seconds = Math.round((performance.now() - start) / 100) / 10

  // Scored in a copy, so the agent's folder never holds hidden tests when a follow-up runs in it. Hidden
  // files overwrite anything the agent wrote at the same path, including edited tests.
  const scored = `${input.dir}-scored-${input.phase}`
  await cp(input.dir, scored, { recursive: true })
  const hidden = await readdir(path.join(input.taskDir, input.hidden))
  await cp(path.join(input.taskDir, input.hidden), scored, { recursive: true, force: true })
  const ts = hidden.filter((f) => f.endsWith(".ts")).map((f) => `./${f}`)
  const py = hidden.filter((f) => f.endsWith(".py"))
  const checks = [ts.length ? ["bun", "test", ...ts] : [], py.length ? ["python3", "-m", "unittest", ...py] : []]
  const tests = []
  for (const check of checks.filter((c) => c.length))
    tests.push(await exec(["timeout", "-k", "5", "120", ...CAPPED, ...check], scored))
  await rm(scored, { recursive: true, force: true })

  return {
    agent: input.agent,
    task: input.task,
    run: input.n,
    phase: input.phase,
    pass: tests.length > 0 && tests.every((t) => t.code === 0),
    seconds,
    exitCode: agentRun.code,
    timedOut: agentRun.code === 124,
    ...agents[input.agent].parse(agentRun.stdout),
    agentStderr: agentRun.code === 0 ? undefined : agentRun.stderr.slice(-2000),
    testOutput: tests.map((t) => (t.stdout + t.stderr).slice(-2000)).join("\n"),
  }
}

async function exec(cmd: string[], cwd: string) {
  // devcode works in PWD, which a child does not get from cwd alone.
  const proc = Bun.spawn(cmd, { cwd, env: { ...process.env, PWD: cwd }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
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

function total(report: Report) {
  return report.tokens ? report.tokens.input + report.tokens.output : 0
}

function median(values: number[]) {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
}
