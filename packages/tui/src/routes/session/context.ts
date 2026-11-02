import type { AssistantMessage, Message, Part } from "@dev-ai/sdk/v2"

export type ContextBreakdown = {
  total: number
  limit?: number
  rows: { label: string; tokens: number }[]
  tips: string[]
}

// About four characters to a token for English and code; good enough to compare categories.
const estimate = (text: string) => Math.ceil(text.length / 4)

/**
 * What fills the context window: the last request's real token count, split into the conversation
 * (estimated from its parts) and DeV's fixed overhead (instructions, tool definitions, memory, skills),
 * which is whatever the conversation does not account for. Messages before the latest compaction
 * summary are not sent to the model, so they are left out.
 */
export function contextBreakdown(
  messages: Message[],
  partsOf: (messageID: string) => Part[],
  limitOf: (message: AssistantMessage) => number | undefined,
): ContextBreakdown | undefined {
  const last = messages.findLast(
    (item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0,
  )
  if (!last) return
  const total =
    last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
  const start = messages.findLastIndex((item) => item.role === "assistant" && item.summary === true)
  const sizes = new Map<string, number>()
  const add = (label: string, tokens: number) => sizes.set(label, (sizes.get(label) ?? 0) + tokens)
  for (const message of messages.slice(Math.max(0, start))) {
    for (const part of partsOf(message.id)) {
      if (part.type === "text" && !part.synthetic)
        add(message.role === "user" ? "Your messages" : "DeV's replies", estimate(part.text))
      if (part.type === "reasoning") add("DeV's reasoning", estimate(part.text))
      if (part.type === "file") add("Attached files", estimate(part.url))
      if (part.type === "tool")
        add(
          `Tool: ${part.tool}`,
          estimate(JSON.stringify(part.state.input ?? {})) +
            (part.state.status === "completed" ? estimate(part.state.output) : 0),
        )
    }
  }
  const conversation = [...sizes.values()].reduce((sum, value) => sum + value, 0)
  const rows = [
    { label: "Instructions, tools and memory", tokens: Math.max(0, total - conversation) },
    ...[...sizes].map(([label, tokens]) => ({ label, tokens })).sort((a, b) => b.tokens - a.tokens),
  ].filter((row) => row.tokens > 0)
  const limit = limitOf(last)
  return { total, limit, rows, tips: tips(total, limit, rows) }
}

function tips(total: number, limit: number | undefined, rows: ContextBreakdown["rows"]) {
  const out: string[] = []
  // Advice about what takes room only matters once room is short.
  const filling = !limit || total / limit > 0.4
  if (limit && total / limit > 0.6)
    out.push("Over 60% full: /compact now, with a focus such as \"/compact keep the auth fix\", keeps what matters.")
  const tool = rows.find((row) => row.label.startsWith("Tool: "))
  if (filling && tool && tool.tokens / total > 0.3)
    out.push(
      `${tool.label.slice(6)} output is the largest part. Ask for narrower reads or searches, or give big lookups to a subagent so only its summary comes back.`,
    )
  const overhead = rows.find((row) => row.label === "Instructions, tools and memory")
  if (filling && overhead && overhead.tokens / total > 0.5 && total > 8000)
    out.push("Most of it is fixed overhead. Turning off MCP servers you don't use (/mcp) frees room for the conversation.")
  if (out.length === 0) out.push("Nothing to change: plenty of room left.")
  return out
}

/** The breakdown as text lines with bars, for a dialog. */
export function formatBreakdown(breakdown: ContextBreakdown, format: (value: number) => string) {
  const width = 20
  const scale = breakdown.limit ?? breakdown.total
  const head = breakdown.limit
    ? `${format(breakdown.total)} of ${format(breakdown.limit)} tokens (${Math.round((breakdown.total / breakdown.limit) * 100)}%)`
    : `${format(breakdown.total)} tokens`
  const label = Math.max(...breakdown.rows.map((row) => row.label.length))
  const lines = breakdown.rows.map((row) => {
    const filled = Math.max(1, Math.round((row.tokens / scale) * width))
    return `${row.label.padEnd(label)}  ${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}  ~${format(row.tokens)}`
  })
  return [head, "", ...lines, "", ...breakdown.tips.map((tip) => `• ${tip}`)].join("\n")
}
