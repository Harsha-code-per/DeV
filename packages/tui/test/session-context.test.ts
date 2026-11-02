import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Message, Part } from "@dev-ai/sdk/v2"
import { contextBreakdown, formatBreakdown } from "../src/routes/session/context"

const tokens = (input: number) => ({ input, output: 100, reasoning: 0, cache: { read: 0, write: 0 } })
const user = (id: string) => ({ id, role: "user" }) as unknown as Message
const assistant = (id: string, input: number, summary = false) =>
  ({ id, role: "assistant", providerID: "p", modelID: "m", tokens: tokens(input), summary }) as unknown as AssistantMessage
const text = (text: string) => ({ type: "text", text }) as unknown as Part
const tool = (name: string, output: string) =>
  ({ type: "tool", tool: name, state: { status: "completed", input: {}, output } }) as unknown as Part

describe("context breakdown", () => {
  test("splits the real total into the conversation and fixed overhead, after the last compaction", () => {
    const parts: Record<string, Part[]> = {
      old: [text("x".repeat(40_000))],
      sum: [text("y".repeat(400))],
      u1: [text("z".repeat(400))],
      a1: [tool("read", "r".repeat(8_000))],
    }
    const messages = [user("old"), assistant("sum", 1000, true), user("u1"), assistant("a1", 9_900)]
    const result = contextBreakdown(messages, (id) => parts[id] ?? [], () => 100_000)!
    expect(result.total).toBe(10_000)
    // 100 summary + 100 user + 2001 read (input "{}" and output) of the conversation; the rest is overhead.
    expect(result.rows.map((row) => row.label)).toEqual([
      "Instructions, tools and memory",
      "Tool: read",
      "DeV's replies",
      "Your messages",
    ])
    expect(result.rows[0]!.tokens).toBe(10_000 - 2_001 - 100 - 100)
    expect(result.tips).toEqual(["Nothing to change: plenty of room left."])
    expect(formatBreakdown(result, String)).toContain("10000 of 100000 tokens (10%)")
  })

  test("suggests compacting when the window is filling up", () => {
    const messages = [user("u"), assistant("a", 70_000)]
    const result = contextBreakdown(messages, () => [], () => 100_000)!
    expect(result.tips[0]).toContain("/compact")
  })

  test("is undefined before the first reply", () => {
    expect(contextBreakdown([user("u")], () => [], () => undefined)).toBeUndefined()
  })
})
