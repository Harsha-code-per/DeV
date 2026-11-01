import { describe, expect, test } from "bun:test"
import { isPrompt, nowText, phase, phaseStarts, receipt, roots } from "../../src/routes/session/turn"

const tool = (name: string, input: object, state: object = {}) =>
  ({
    id: `p${Math.random()}`,
    type: "tool",
    tool: name,
    state: { status: "completed", input, metadata: {}, ...state },
  }) as never
const bash = (command: string, exit = 0) => tool("bash", { command }, { metadata: { exit } })
const assistant = (extra: object = {}) => ({ role: "assistant", cost: 0, time: { completed: 5000 }, ...extra }) as never

describe("turns", () => {
  test("synthetic follow-ups stay in the turn of the real prompt", () => {
    const parts: Record<string, unknown[]> = {
      u1: [{ type: "text", text: "fix it" }],
      nudge: [{ type: "text", text: "go ahead", synthetic: true }],
      u2: [{ type: "text", text: "now docs" }],
    }
    const messages = ["u1", "a1", "nudge", "a2", "u2", "a3"].map((id) => ({
      id,
      role: id.startsWith("a") ? "assistant" : "user",
    }))
    const map = roots(messages as never, (id) => (parts[id] ?? []) as never)
    expect(map.get("a2")).toBe("u1")
    expect(map.get("a3")).toBe("u2")
    expect(isPrompt(parts.nudge as never)).toBe(false)
  })
})

describe("phases", () => {
  test("reading is plan, changing is do, running checks is verify", () => {
    expect(phase(tool("read", {}))).toBe("plan")
    expect(phase(tool("plan_enter", {}))).toBe("plan")
    expect(phase(tool("edit", {}))).toBe("do")
    expect(phase(bash("git status"))).toBe("plan")
    expect(phase(bash("mkdir src"))).toBe("do")
    expect(phase(bash("cd app && bun test"))).toBe("verify")
    expect(phase(bash("npm run build"))).toBe("verify")
    expect(phase(bash("pytest -q"))).toBe("verify")
  })

  test("a file that only mentions tests isn't a check", () => {
    expect(phase(bash("mkdir tests"))).toBe("do")
    expect(phase(bash("cat src/cart.test.js"))).toBe("plan")
  })

  test("a phase opens only when it changes", () => {
    const parts = [tool("read", {}), tool("grep", {}), tool("edit", {}), bash("bun test"), tool("edit", {})]
    expect([...phaseStarts(parts as never).values()]).toEqual(["plan", "do", "verify", "do"])
  })
})

describe("receipts", () => {
  const edit = tool("edit", { filePath: "a.js" }, { metadata: { diff: "--- a\n+++ b\n-old\n+new\n+more" } })

  test("counts files, lines, steps, time and cost", () => {
    const result = receipt(1000, [assistant({ cost: 0.25 })], [edit, bash("ls")] as never)
    expect(result).toMatchObject({ files: 1, added: 2, removed: 1, steps: 2, duration: 4000, cost: 0.25 })
  })

  test("a new file counts all its lines as added", () => {
    const write = tool("write", { filePath: "n.js", content: "a\nb\nc" }, { metadata: { exists: false } })
    expect(receipt(0, [assistant()], [write] as never)).toMatchObject({ files: 1, added: 3, removed: 0 })
  })

  test("says nothing about tests when none ran", () => {
    expect(receipt(0, [assistant()], [edit] as never).checks).toBeUndefined()
  })

  test("the last check decides, so a fixed failure passes and a new failure fails", () => {
    expect(receipt(0, [assistant()], [bash("bun test", 1), bash("bun test", 0)] as never).checks).toBe("passed")
    expect(receipt(0, [assistant()], [bash("bun test", 0), bash("bun test", 1)] as never).checks).toBe("failed")
  })

  test("a failed edit isn't counted as a changed file", () => {
    const failed = tool("edit", { filePath: "a.js" }, { status: "error" })
    expect(receipt(0, [assistant()], [failed] as never).files).toBe(0)
  })

  test("reports errors and interruptions", () => {
    expect(receipt(0, [assistant({ error: { name: "APIError" } })], []).ended).toBe("failed")
    expect(receipt(0, [assistant({ error: { name: "MessageAbortedError" } })], []).ended).toBe("interrupted")
  })
})

test("the NOW line says what's happening", () => {
  expect(nowText(undefined)).toBe("Thinking")
  expect(nowText(bash("bun test\nmore"))).toBe("Running bun test")
  expect(nowText(tool("edit", { filePath: "/a/src/cart.js" }))).toBe("Editing cart.js")
})
