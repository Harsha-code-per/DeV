import { expect, test } from "bun:test"
import { SessionGoal } from "../../src/session/goal"

test("a goal keeps the session working, and a claimed MET goes to an independent reviewer", () => {
  SessionGoal.apply("g1", { action: "set", objective: "all tests pass" })
  const check = SessionGoal.next("g1", "I fixed one test.")
  expect(check?.type).toBe("continue")
  expect(check?.type === "continue" && check.text).toContain("all tests pass")
  expect(SessionGoal.get("g1")).toMatchObject({ status: "active", rounds: 1 })

  const review = SessionGoal.next("g1", `Everything passes.\n${SessionGoal.MET_MARKER}`)
  expect(review?.type).toBe("review")
  // The reviewer says not met: its findings become the next instruction.
  expect(SessionGoal.reviewed("g1", "test_b fails.\nVERDICT: NOT MET - test_b fails")).toContain("test_b fails")
  expect(SessionGoal.get("g1")?.status).toBe("active")
  // Quoting the instructions doesn't pass; the last verdict counts.
  expect(SessionGoal.reviewed("g1", "I must say VERDICT: MET or VERDICT: NOT MET.\nVERDICT: NOT MET")).toBeDefined()
  expect(SessionGoal.reviewed("g1", "All 12 tests pass.\nVERDICT: MET")).toBeUndefined()
  expect(SessionGoal.get("g1")?.status).toBe("met")
  expect(SessionGoal.next("g1", "anything")).toBeUndefined()
})

test("paused goals let the session stop; resume and clear work; rounds are capped", () => {
  SessionGoal.apply("g2", { action: "set", objective: "ship it" })
  SessionGoal.apply("g2", { action: "pause" })
  expect(SessionGoal.next("g2", "")).toBeUndefined()
  SessionGoal.apply("g2", { action: "resume" })
  for (let round = 0; round < SessionGoal.MAX_ROUNDS; round++) expect(SessionGoal.next("g2", "")).toBeDefined()
  expect(SessionGoal.next("g2", "")).toBeUndefined()
  expect(SessionGoal.get("g2")?.status).toBe("stopped")
  SessionGoal.apply("g2", { action: "clear" })
  expect(SessionGoal.get("g2")).toBeUndefined()
  expect(() => SessionGoal.apply("g2", { action: "pause" })).toThrow("no goal")
  expect(() => SessionGoal.apply("g2", { action: "set", objective: " " })).toThrow("objective")
})
