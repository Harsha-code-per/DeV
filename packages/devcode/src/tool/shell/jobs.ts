// Shell commands running in the background (dev servers, watchers, long builds). Each one writes to a
// log file; shell_job reads what is new since the last read, or stops the command. They live as long
// as this DeV process and are stopped when it exits.
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import { TRUNCATION_DIR } from "../truncation-dir"

type Job = {
  id: string
  command: string
  log: string
  child: ChildProcess
  started: number
  read: number
  exit?: number | null
  done: Promise<void>
}

const jobs = new Map<string, Job>()
let next = 1

process.once("exit", () => jobs.forEach((job) => job.exit === undefined && signal(job, "SIGKILL")))

/** Starts `command` with `shell` and returns at once. `onExit` runs when it ends, however it ends. */
export function start(input: {
  shell: string
  command: string
  label: string
  cwd: string
  env: NodeJS.ProcessEnv
  onExit?: () => void
}) {
  fs.mkdirSync(TRUNCATION_DIR, { recursive: true })
  const id = `job${next++}`
  const log = path.join(TRUNCATION_DIR, `${id}-${process.pid}-${Date.now()}.log`)
  const out = fs.openSync(log, "a")
  const windowsPowerShell = process.platform === "win32" && /pwsh|powershell/i.test(path.basename(input.shell))
  const windowsCmd = process.platform === "win32" && /^cmd(\.exe)?$/i.test(path.basename(input.shell))
  const args = windowsPowerShell
    ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", input.command]
    : windowsCmd
      ? ["/d", "/s", "/c", input.command]
      : ["-c", input.command]
  const child = spawn(input.shell, args, {
    cwd: input.cwd,
    env: input.env,
    stdio: ["ignore", out, out],
    detached: process.platform !== "win32",
  })
  fs.closeSync(out)
  const job: Job = {
    id,
    command: input.label,
    log,
    child,
    started: Date.now(),
    read: 0,
    done: new Promise((resolve) => {
      child.once("exit", (code) => {
        job.exit = code
        input.onExit?.()
        resolve()
      })
      child.once("error", (error) => {
        fs.appendFileSync(log, `\n${error.message}\n`)
        job.exit = -1
        input.onExit?.()
        resolve()
      })
    }),
  }
  jobs.set(id, job)
  return { id, log, pid: child.pid }
}

/** What the job printed since the last read (at most the last `max` bytes of it), and whether it still runs. */
export function output(id: string, max = 30_000) {
  const job = jobs.get(id)
  if (!job) return
  const size = fs.statSync(job.log).size
  const from = Math.max(job.read, size - max)
  const fd = fs.openSync(job.log, "r")
  const buffer = Buffer.alloc(size - from)
  fs.readSync(fd, buffer, 0, buffer.length, from)
  fs.closeSync(fd)
  const skipped = from > job.read ? from - job.read : 0
  job.read = size
  return { text: buffer.toString("utf8"), skipped, ...status(job) }
}

/** Stops the job: SIGTERM to its group, then SIGKILL after three seconds if it is still running. */
export async function stop(id: string) {
  const job = jobs.get(id)
  if (!job) return
  if (job.exit === undefined) {
    signal(job, "SIGTERM")
    const timer = setTimeout(() => signal(job, "SIGKILL"), 3000)
    await job.done
    clearTimeout(timer)
  }
  return status(job)
}

export function list() {
  return [...jobs.values()].map((job) => ({ id: job.id, command: job.command, log: job.log, ...status(job) }))
}

function status(job: Job) {
  const seconds = Math.round((Date.now() - job.started) / 1000)
  return {
    running: job.exit === undefined,
    state: job.exit === undefined ? `running for ${seconds}s` : `exited with code ${job.exit}`,
  }
}

function signal(job: Job, name: NodeJS.Signals) {
  const pid = job.child.pid
  if (process.platform === "win32" || !pid) return void job.child.kill(name)
  // The sandbox starts the command in a session of its own, outside the job's process group, so
  // every process descended from the job is signalled by PID, deepest first.
  for (const each of [...descendants(pid).reverse(), pid]) {
    try {
      process.kill(each, name)
    } catch {
      // Already gone.
    }
  }
}

function descendants(root: number) {
  const children = new Map<number, number[]>()
  for (const line of Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid="]).stdout.toString().split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number)
    if (pid && ppid) children.set(ppid, [...(children.get(ppid) ?? []), pid])
  }
  const found: number[] = []
  const walk = (pid: number) => (children.get(pid) ?? []).forEach((child) => (found.push(child), walk(child)))
  walk(root)
  return found
}

export * as ShellJobs from "./jobs"
