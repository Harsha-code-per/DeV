import type { AssistantMessage, Message, Part, ToolPart } from "@dev-ai/sdk/v2"

// A turn is one thing you asked for: a prompt plus every reply until your next prompt. Follow-ups DeV
// adds itself (goal checks, nudges) are synthetic, so they stay in the same turn.

export type Phase = "plan" | "do" | "verify"

const LOOKING = new Set(["read", "grep", "glob", "list", "webfetch", "websearch", "todowrite", "question", "skill"])
const PLANNING = new Set(["plan_enter", "plan_exit", "goal_set", "task"])
const CHECKS =
  /(?:^|[\s;&|(])(?:(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:test|typecheck|lint|build)|vitest|jest|pytest|tsc|eslint|cargo\s+(?:test|check|build|clippy)|go\s+(?:test|build|vet)|make\s+(?:test|check|build)|gradle\s+test|mvn\s+test)\b/
const READ_ONLY = /^\s*(?:ls|cat|pwd|rg|grep|find|head|tail|wc|which|echo|git\s+(?:status|diff|log|show|branch))\b/

export function isPrompt(parts: Part[]) {
  return parts.some((part) => part.type === "text" && !part.synthetic && part.text.trim() !== "")
}

/** Maps each message to the prompt that started its turn. */
export function roots(messages: Message[], partsOf: (id: string) => Part[]) {
  const map = new Map<string, string>()
  const state = { root: "" }
  for (const message of messages) {
    if (message.role === "user" && (isPrompt(partsOf(message.id)) || !state.root)) state.root = message.id
    map.set(message.id, state.root)
  }
  return map
}

export function phase(part: Pick<ToolPart, "tool" | "state">): Phase {
  if (LOOKING.has(part.tool) || PLANNING.has(part.tool)) return "plan"
  if (part.tool !== "bash") return "do"
  const command = stringInput(part, "command")
  if (CHECKS.test(command)) return "verify"
  return READ_ONLY.test(command) ? "plan" : "do"
}

/** The parts that open a new phase, in turn order. */
export function phaseStarts(parts: Part[]) {
  const starts = new Map<string, Phase>()
  const state: { last?: Phase } = {}
  for (const part of parts) {
    if (part.type !== "tool") continue
    const current = phase(part)
    if (current !== state.last) starts.set(part.id, current)
    state.last = current
  }
  return starts
}

export type Receipt = {
  files: number
  added: number
  removed: number
  checks: "passed" | "failed" | undefined
  steps: number
  duration: number
  cost: number
  ended: "done" | "failed" | "interrupted"
}

export function receipt(started: number, assistants: AssistantMessage[], parts: Part[]): Receipt {
  const tools = parts.flatMap((part) => (part.type === "tool" ? [part] : []))
  const edits = tools.filter((part) => part.state.status === "completed" && ["edit", "write"].includes(part.tool))
  const diff = edits.flatMap((part) => diffLines(part)).concat(tools.flatMap((part) => patchLines(part)))
  const lastCheck = tools.filter((part) => phase(part) === "verify" && part.state.status !== "running").at(-1)
  const last = assistants.at(-1)
  return {
    files: new Set([...edits.map((part) => stringInput(part, "filePath")), ...tools.flatMap(patchFiles)]).size,
    added: diff.filter((line) => line.startsWith("+")).length,
    removed: diff.filter((line) => line.startsWith("-")).length,
    // Only a check that really ran counts, and the last one decides: an early failure that got fixed is a pass.
    checks: lastCheck ? (checkPassed(lastCheck) ? "passed" : "failed") : undefined,
    steps: tools.length,
    duration: Math.max(0, (last?.time.completed ?? started) - started),
    cost: assistants.reduce((sum, message) => sum + message.cost, 0),
    ended:
      last?.error?.name === "MessageAbortedError" ? "interrupted" : assistants.some(hasError) ? "failed" : "done",
  }
}

/** One short line saying what a running step is doing. */
export function nowText(part: ToolPart | undefined) {
  if (!part) return "Thinking"
  const file = stringInput(part, "filePath").split("/").at(-1)
  if (part.tool === "bash") return `Running ${stringInput(part, "command").split("\n")[0]}`
  if (part.tool === "read") return `Reading ${file}`
  if (part.tool === "edit" || part.tool === "write") return `Editing ${file}`
  if (part.tool === "grep" || part.tool === "glob") return "Searching the code"
  if (part.tool === "task") return "Running a subagent"
  if (part.tool === "webfetch" || part.tool === "websearch") return "Reading the web"
  return `Using ${part.tool}`
}

function hasError(message: AssistantMessage) {
  return message.error !== undefined && message.error.name !== "MessageAbortedError"
}

function checkPassed(part: ToolPart) {
  return part.state.status === "completed" && part.state.metadata?.exit === 0
}

function stringInput(part: Pick<ToolPart, "state">, key: string) {
  const value = part.state.input?.[key]
  return typeof value === "string" ? value : ""
}

function diffLines(part: ToolPart) {
  const metadata = part.state.status === "completed" ? part.state.metadata : undefined
  // A new file written whole reports no diff, and every line in it is an addition.
  if (part.tool === "write" && metadata?.exists === false)
    return stringInput(part, "content")
      .split("\n")
      .map((line) => `+${line}`)
  const diff = metadata?.diff
  if (typeof diff !== "string") return []
  return diff.split("\n").filter((line) => !line.startsWith("+++") && !line.startsWith("---"))
}

function patchEntries(part: ToolPart) {
  if (part.tool !== "apply_patch" || part.state.status !== "completed") return []
  const files = part.state.metadata?.files
  return Array.isArray(files) ? (files as { filePath?: string; patch?: string }[]) : []
}

function patchFiles(part: ToolPart) {
  return patchEntries(part).flatMap((file) => (file.filePath ? [file.filePath] : []))
}

function patchLines(part: ToolPart) {
  return patchEntries(part).flatMap((file) =>
    (file.patch ?? "").split("\n").filter((line) => !line.startsWith("+++") && !line.startsWith("---")),
  )
}
