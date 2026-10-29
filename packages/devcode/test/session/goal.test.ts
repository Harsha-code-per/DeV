import { expect, test } from "bun:test"
import { SessionGoal } from "../../src/session/goal"

test("a goal keeps the session working until the agent reports it met", () => {
  SessionGoal.apply("g1", { action: "set", objective: "all tests pass" })
  expect(SessionGoal.next("g1", "I fixed one test.")).toContain("all tests pass")
  expect(SessionGoal.get("g1")).toMatchObject({ status: "active", rounds: 1 })
  expect(SessionGoal.next("g1", `Everything passes.\n${SessionGoal.MET_MARKER}`)).toBeUndefined()
  expect(SessionGoal.get("g1")?.status).toBe("met")
  // A met goal lets the session stop.
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
