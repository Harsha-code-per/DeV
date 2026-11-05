import { Option, Schema } from "effect"
import fs from "node:fs"
import path from "node:path"
import { Global } from "@dev-ai/core/global"

// `/goal <objective>`: the session keeps working until the objective is met. Each time the agent would
// stop, DeV asks it to check the objective against real evidence (tests, builds, the files themselves)
// and either continue or end its reply with MET_MARKER, or IMPOSSIBLE_MARKER when it can never be met.
// Either claim goes to an independent reviewer (a separate session that can't edit files), whose verdict
// decides, so the agent can't give up just because the work is hard. Pause, resume and clear control it.
// Active and paused goals are also saved to disk, so restarting DeV or `devcode -s` picks them back up
// (with the round count reset); met, stopped and cleared goals are not restored.

export const MET_MARKER = "GOAL MET"
export const IMPOSSIBLE_MARKER = "GOAL IMPOSSIBLE"
export const MAX_ROUNDS = 25

export const Status = Schema.Literals(["active", "paused", "met", "impossible", "stopped"])

export const State = Schema.Struct({
  objective: Schema.String,
  status: Status,
  rounds: Schema.Int,
  /** Why the reviewer judged the goal impossible. */
  reason: Schema.optional(Schema.String),
}).annotate({ identifier: "SessionGoal" })
export type State = Schema.Schema.Type<typeof State>

export const Action = Schema.Struct({
  action: Schema.Literals(["set", "pause", "resume", "clear"]),
  objective: Schema.optional(Schema.String),
}).annotate({ identifier: "SessionGoalAction" })
export type Action = Schema.Schema.Type<typeof Action>

const goals = new Map<string, State>()
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(State))

export function get(sessionID: string) {
  return goals.get(sessionID) ?? restore(sessionID)
}

export function apply(sessionID: string, input: Action) {
  const current = get(sessionID)
  if (input.action === "clear") {
    goals.delete(sessionID)
    fs.rmSync(file(sessionID), { force: true })
    return undefined
  }
  if (input.action === "set") {
    const objective = input.objective?.trim()
    if (!objective) throw new Error("A goal needs an objective: /goal <what should be true when you're done>")
    return save(sessionID, { objective, status: "active", rounds: 0 })
  }
  if (!current) throw new Error("This session has no goal. Set one with /goal <objective>.")
  return save(sessionID, { ...current, status: input.action === "pause" ? "paused" : "active" })
}

export type Next = { type: "continue"; text: string } | { type: "review"; prompt: string }

/**
 * Called when the agent is about to stop: keep working (`continue`), have the claimed goal checked by
 * an independent reviewer (`review`), or undefined when it may stop (no active goal, met, or out of rounds).
 */
export function next(sessionID: string, reply: string): Next | undefined {
  const current = get(sessionID)
  if (current?.status !== "active") return undefined
  if (current.rounds >= MAX_ROUNDS) {
    save(sessionID, { ...current, status: "stopped" })
    return undefined
  }
  save(sessionID, { ...current, rounds: current.rounds + 1 })
  if (reply.includes(MET_MARKER)) return { type: "review", prompt: reviewPrompt(current.objective, "met") }
  if (reply.includes(IMPOSSIBLE_MARKER))
    return { type: "review", prompt: reviewPrompt(current.objective, reply.slice(reply.indexOf(IMPOSSIBLE_MARKER))) }
  return { type: "continue", text: checkPrompt(current) }
}

/** Applies the reviewer's verdict: undefined when the goal is met, else the instruction to keep working. */
export function reviewed(sessionID: string, review: string) {
  const current = get(sessionID)
  if (!current) return undefined
  // The last verdict counts, so a reviewer quoting the instructions doesn't pass by accident.
  const verdict = [...review.matchAll(/VERDICT:\s*(NOT MET|MET|IMPOSSIBLE)\b/gi)].at(-1)
  const kind = verdict?.[1]?.toUpperCase()
  if (kind === "MET") {
    save(sessionID, { ...current, status: "met" })
    return undefined
  }
  if (kind === "IMPOSSIBLE") {
    const reason = review.slice((verdict?.index ?? 0) + (verdict?.[0].length ?? 0)).trim()
    save(sessionID, { ...current, status: "impossible", reason: reason || undefined })
    return undefined
  }
  return [
    "An independent reviewer checked the goal and found it is not met yet:",
    review.trim(),
    "",
    `Fix what it found, verify it, and end your reply with ${MET_MARKER} only when it is really done.`,
  ].join("\n")
}

function reviewPrompt(objective: string, claim: string) {
  return [
    claim === "met"
      ? "You are an independent reviewer. Another agent says this goal is met:"
      : "You are an independent reviewer. Another agent says this goal can never be met:",
    objective,
    ...(claim === "met" ? [] : ["", `Its reason: ${claim}`]),
    "",
    "Check it yourself against real evidence in this project: read the relevant files and run the project's tests,",
    "typecheck or build where they exist. Do not change any files.",
    "A goal met only by faking it (patching tools, environment variables, shell or system config, special-cased tests)",
    "is NOT MET.",
    "End your reply with exactly one line: VERDICT: MET, VERDICT: NOT MET followed by what is missing or failing,",
    "or VERDICT: IMPOSSIBLE followed by why, only when no amount of work in this project could meet it",
    "(it contradicts itself, or needs access or resources that are not available here).",
  ].join("\n")
}

function checkPrompt(current: State) {
  return [
    `Goal check (round ${current.rounds + 1} of ${MAX_ROUNDS}). The goal for this session is:`,
    current.objective,
    "",
    "Check it against real evidence: run the project's tests, typecheck or build, and look at the actual files.",
    "Meet it honestly inside this project: never fake the result (patch tools, special-case tests, change shell or system",
    "config, or edit anything outside the project) to make it look met. If that is the only way, the goal is impossible.",
    "If something is missing or failing, keep working on it now.",
    `Only when the goal is fully met and verified, end your reply with a line containing exactly: ${MET_MARKER}`,
    `If it can never be met (it contradicts itself, or needs access you don't have), end with ${IMPOSSIBLE_MARKER}: and the reason.`,
  ].join("\n")
}

/** The first message of a goal. */
export function kickoff(objective: string) {
  return [
    "Goal for this session:",
    objective,
    "",
    "Work toward it until it is fully done and verified; you'll be asked to check it each time you stop.",
  ].join("\n")
}

function save(sessionID: string, state: State) {
  goals.set(sessionID, state)
  if (state.status === "active" || state.status === "paused") {
    fs.mkdirSync(path.dirname(file(sessionID)), { recursive: true })
    fs.writeFileSync(file(sessionID), JSON.stringify(state))
  }
  if (state.status !== "active" && state.status !== "paused") fs.rmSync(file(sessionID), { force: true })
  return state
}

function restore(sessionID: string) {
  if (!fs.existsSync(file(sessionID))) return undefined
  const saved = Option.getOrUndefined(decode(fs.readFileSync(file(sessionID), "utf8")))
  if (saved?.status !== "active" && saved?.status !== "paused") return undefined
  goals.set(sessionID, { ...saved, rounds: 0 })
  return goals.get(sessionID)
}

function file(sessionID: string) {
  return path.join(Global.Path.state, "goals", `${path.basename(sessionID)}.json`)
}

export * as SessionGoal from "./goal"
