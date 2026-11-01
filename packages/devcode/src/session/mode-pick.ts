// DeV picks the mode here rather than leaving it to the model: free models ignore tool descriptions and
// reminders at very different rates, so asking them gave 8 of 10 on one provider and 3 of 10 on another.
// ponytail: wording rules, so unusual phrasing stays in Build. That is the safe side: you can still press
// Shift+Tab, and the agent can call plan_enter itself.

const NO_PLAN = /\b(?:without (?:a )?plan(?:ning)?|no plan|skip (?:the )?plan(?:ning)?|don'?t plan|do not plan)\b/i
const ASKS_FOR_PLAN = /\bplan (?:it|this|that) (?:first|out)\b|\bmake a plan\b|\bwrite a plan\b/i
const KEEP_GOING = /\b(?:keep (?:going|working|trying|fixing)|(?:don'?t|do not|never) stop)\b.*\buntil\b/i
const UNTIL_DONE = /\buntil\b.*\b(?:pass|passes|passing|green|clean|works?|working)\b/i
const KEEP_AT_IT = /\bkeep (?:going|working|trying|fixing)\b.*\b(?:tests?|build|everything)\b/i
const BIG_WORK =
  /^(?:(?:please|can you|could you)\s+)?(?:add|build|create|implement|migrate|rewrite|redesign|refactor|design|port|convert|develop|introduce)\b/i
const SMALL_WORK = /\b(?:quick|quickly|small|simple|tiny|typo|rename|one[- ]line|just)\b/i
const NAMES_A_FILE = /\S+\.[a-z]{1,5}\b|`[^`]+`/i
const MIN_WORDS = 6

export function pick(text: string) {
  const prompt = text.trim()
  if (KEEP_GOING.test(prompt) || UNTIL_DONE.test(prompt) || KEEP_AT_IT.test(prompt)) return "goal_set"
  if (NO_PLAN.test(prompt) || prompt.endsWith("?")) return undefined
  if (ASKS_FOR_PLAN.test(prompt)) return "plan_enter"
  const big =
    BIG_WORK.test(prompt) &&
    prompt.split(/\s+/).length >= MIN_WORDS &&
    !SMALL_WORK.test(prompt) &&
    !NAMES_A_FILE.test(prompt)
  return big ? "plan_enter" : undefined
}

export * as ModePick from "./mode-pick"
