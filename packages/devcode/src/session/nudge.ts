// Free models often end a turn right after announcing their next step ("I'll read the log, then write
// the script.") without doing it, or with an empty reply. When a reply with no tool calls ends like that,
// DeV tells the agent to go ahead, at most MAX_NUDGES times per user message so a real question can't loop.

export const MAX_NUDGES = 2

// The last sentence starts by announcing work ("I'll …", "Let me …"), or ends with a colon.
const ANNOUNCEMENT =
  /^(?:(?:Now|Next|First|Then),?\s+)?(?:I'll|I will|I'm going to|I am going to|Let me|Let's|I need to)\b/i
// …unless it hands control back ("Let me know if …", "I'll leave the docs as they are").
const HANDBACK = /\b(?:let me know|leave|wait for|stop here|if you)\b/i

// A finished plan needs plan_exit to reach the user; free models sometimes write its name or say the
// plan is done without calling it.
const PLAN_READY = /plan_exit|plan (?:is |has been )?(?:written|ready|complete|finished)/i

const nudges = new Map<string, number>()

/**
 * The instruction to keep going, or undefined when the reply is a real ending. `cutOff` is a reply that
 * stopped at the model's output limit, which is never a real ending, whatever its last sentence says.
 */
export function next(userMessageID: string, reply: string, agent?: string, cutOff = false) {
  const count = nudges.get(userMessageID) ?? 0
  if (cutOff && count < MAX_NUDGES) {
    nudges.set(userMessageID, count + 1)
    return "Your last reply hit the length limit before it was finished. Continue from where it stopped; if you were about to change files, do it now with your tools."
  }
  if (agent === "plan" && PLAN_READY.test(reply) && count < MAX_NUDGES) {
    nudges.set(userMessageID, count + 1)
    return "If the plan is finished, call the plan_exit tool now; writing its name does nothing. If you need something from the user, use the question tool."
  }
  const lastSentence =
    reply
      .trim()
      .split(/(?<=[.!?])\s+/)
      .at(-1) ?? ""
  // An empty final reply is never a real ending: free models sometimes just stop.
  const silent = lastSentence === ""
  // Questions to the user are real endings.
  if (lastSentence.endsWith("?")) return undefined
  const announces = lastSentence.trimEnd().endsWith(":") || ANNOUNCEMENT.test(lastSentence)
  if (!silent && (!announces || HANDBACK.test(lastSentence))) return undefined
  if (count >= MAX_NUDGES) return undefined
  nudges.set(userMessageID, count + 1)
  return "Go ahead and do that now with your tools; don't stop until the task is done. If you are actually finished, say so plainly."
}

const EDITS = new Set(["edit", "write", "apply_patch", "notebook_edit"])
// A command that checks the work: tests, type checks, linters, builds.
const CHECK =
  /\b(?:test|tests|pytest|jest|vitest|mocha|tsc|typecheck|type-check|lint|eslint|ruff|mypy|pyright|clippy|build|cargo|go (?:test|vet|build)|mvn|gradle|make|check)\b/i
const PAGE = /\.(?:html?|css|scss|sass|less|jsx|tsx|vue|svelte|astro)\b/i
const BROWSER = /chrome|playwright|browser|puppeteer/i
const checked = new Set<string>()

/**
 * Before a turn that changed files ends: the instruction to run the project's checks, or to look at a changed
 * page in the browser, or undefined. Once per user message, so it can't loop. `calls` are the tool calls made
 * since that message; `browser` says whether a browser tool is connected.
 */
export function checks(userMessageID: string, calls: { tool: string; input: Record<string, unknown> }[], browser: boolean) {
  if (checked.has(userMessageID)) return undefined
  const edited = calls.filter((call) => EDITS.has(call.tool)).map((call) => JSON.stringify(call.input))
  // Notes and docs alone have nothing to run.
  if (edited.every((input) => /\.(?:md|mdx|txt|rst)"/i.test(input) && !PAGE.test(input))) return undefined
  const ran = calls.filter((call) => call.tool === "bash").map((call) => String(call.input["command"] ?? ""))
  const looked = calls.some((call) => BROWSER.test(call.tool) || (call.tool === "execute" && BROWSER.test(JSON.stringify(call.input))))
  const pages = edited.some((input) => PAGE.test(input))
  const missing = [
    ...(ran.some((command) => CHECK.test(command)) ? [] : ["run the project's checks (its tests, type check or build, whichever it has) and fix what fails"]),
    ...(pages && browser && !looked ? ["open the changed page in the browser with the browser tool and check that it renders and works"] : []),
  ]
  if (missing.length === 0) return undefined
  checked.add(userMessageID)
  return `You changed files in this turn. Before you finish, ${missing.join(", then ")}. If the project has no such check, say so plainly.`
}

export * as SessionNudge from "./nudge"
