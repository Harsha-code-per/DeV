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

// Open-ended requests about the person ("plan a weekend trip for me", "find me a job"): their result
// depends on things only the person knows, and free models skipped asking 4 times in 10 even with the
// rules and a reminder. For these the first step must either ask or say it has enough.
// ponytail: wording rules again; anything else keeps the model's own judgement.
const OPEN_VERB =
  /^(?:(?:please|can you|could you|help me)\s+)?(?:find|suggest|recommend|plan|organi[sz]e|write|design|build|make|create|add|set up|choose|pick|book|research|compare|search|look for|get me|give me|draft|come up with)\b/i
const ABOUT_THEM = /\b(?:me|my|mine|i|i'm|our|us|we)\b/i
const MAX_OPEN_WORDS = 14

export function open(text: string) {
  const prompt = text.trim()
  return (
    prompt.split(/\s+/).length <= MAX_OPEN_WORDS &&
    OPEN_VERB.test(prompt) &&
    ABOUT_THEM.test(prompt) &&
    !NAMES_A_FILE.test(prompt) &&
    !/https?:\/\/|["“]/.test(prompt)
  )
}

// A lasting instruction or preference ("from now on use pnpm", "remember that…"). DeV saves the sentence
// that states it to the project's memory; models otherwise reply "Noted" and forget it with the session.
const REMEMBER =
  /\b(remember (that|this|to)|please remember|from now on|going forward|in (the )?future|next time|always (use|run|write|prefer|ask|keep)|never (use|run|write|commit|push)|i (always )?prefer|my preference)\b/i
// ponytail: a long unbroken run of letters and digits is taken for a key or password and never saved.
const SECRET = /[A-Za-z0-9_+/=-]{24,}/

/** The sentence of a message that states a lasting rule, or undefined. */
export function rule(text: string) {
  const sentence = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .find((part) => REMEMBER.test(part))
  if (!sentence || sentence.length > 300 || SECRET.test(sentence)) return undefined
  return sentence
}

export * as ModePick from "./mode-pick"
