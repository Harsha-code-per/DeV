import { Schema } from "effect"

// `/goal <objective>`: the session keeps working until the objective is met. Each time the agent would
// stop, DeV asks it to check the objective against real evidence (tests, builds, the files themselves)
// and either continue or end its reply with MET_MARKER. A claimed MET goes to an independent reviewer
// (a separate session that can't edit files), whose verdict decides. Pause, resume and clear control it.
// ponytail: goals live in memory, so a server restart forgets them.

export const MET_MARKER = "GOAL MET"
export const MAX_ROUNDS = 25

export const Status = Schema.Literals(["active", "paused", "met", "stopped"])

export const State = Schema.Struct({
  objective: Schema.String,
  status: Status,
  rounds: Schema.Int,
}).annotate({ identifier: "SessionGoal" })
export type State = Schema.Schema.Type<typeof State>

export const Action = Schema.Struct({
  action: Schema.Literals(["set", "pause", "resume", "clear"]),
  objective: Schema.optional(Schema.String),
}).annotate({ identifier: "SessionGoalAction" })
export type Action = Schema.Schema.Type<typeof Action>

const goals = new Map<string, State>()

export function get(sessionID: string) {
  return goals.get(sessionID)
}

export function apply(sessionID: string, input: Action) {
  const current = goals.get(sessionID)
  if (input.action === "clear") {
    goals.delete(sessionID)
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
  const current = goals.get(sessionID)
  if (current?.status !== "active") return undefined
  if (current.rounds >= MAX_ROUNDS) {
    save(sessionID, { ...current, status: "stopped" })
    return undefined
  }
  save(sessionID, { ...current, rounds: current.rounds + 1 })
  if (reply.includes(MET_MARKER)) return { type: "review", prompt: reviewPrompt(current.objective) }
  return { type: "continue", text: checkPrompt(current) }
}

/** Applies the reviewer's verdict: undefined when the goal is met, else the instruction to keep working. */
export function reviewed(sessionID: string, review: string) {
  const current = goals.get(sessionID)
  if (!current) return undefined
  // The last verdict counts, so a reviewer quoting the instructions doesn't pass by accident.
  const verdict = [...review.matchAll(/VERDICT:\s*(NOT MET|MET)\b/gi)].at(-1)?.[1]?.toUpperCase()
  if (verdict === "MET") {
    save(sessionID, { ...current, status: "met" })
    return undefined
  }
  return [
    "An independent reviewer checked the goal and found it is not met yet:",
    review.trim(),
    "",
    `Fix what it found, verify it, and end your reply with ${MET_MARKER} only when it is really done.`,
  ].join("\n")
}

function reviewPrompt(objective: string) {
  return [
    "You are an independent reviewer. Another agent says this goal is met:",
    objective,
    "",
    "Check it yourself against real evidence in this project: read the relevant files and run the project's tests,",
    "typecheck or build where they exist. Do not change any files.",
    "End your reply with exactly one line: VERDICT: MET, or VERDICT: NOT MET followed by what is missing or failing.",
  ].join("\n")
}

function checkPrompt(current: State) {
  return [
    `Goal check (round ${current.rounds + 1} of ${MAX_ROUNDS}). The goal for this session is:`,
    current.objective,
    "",
    "Check it against real evidence: run the project's tests, typecheck or build, and look at the actual files.",
    "If something is missing or failing, keep working on it now.",
    `Only when the goal is fully met and verified, end your reply with a line containing exactly: ${MET_MARKER}`,
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
  return state
}

export * as SessionGoal from "./goal"
