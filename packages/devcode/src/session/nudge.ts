// Free models often end a turn right after announcing their next step ("I'll read the log, then write
// the script.") without doing it, or with an empty reply. When a reply with no tool calls ends like that,
// DeV tells the agent to go ahead, at most MAX_NUDGES times per user message so a real question can't loop.

export const MAX_NUDGES = 2

// The last sentence starts by announcing work ("I'll …", "Let me …"), or ends with a colon.
const ANNOUNCEMENT =
  /^(?:(?:Now|Next|First|Then),?\s+)?(?:I'll|I will|I'm going to|I am going to|Let me|Let's|I need to)\b/i
// …unless it hands control back ("Let me know if …", "I'll leave the docs as they are").
const HANDBACK = /\b(?:let me know|leave|wait for|stop here|if you)\b/i

const nudges = new Map<string, number>()

/** The instruction to keep going, or undefined when the reply is a real ending. */
export function next(userMessageID: string, reply: string) {
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
  const count = nudges.get(userMessageID) ?? 0
  if (count >= MAX_NUDGES) return undefined
  nudges.set(userMessageID, count + 1)
  return "Go ahead and do that now with your tools; don't stop until the task is done. If you are actually finished, say so plainly."
}

export * as SessionNudge from "./nudge"
