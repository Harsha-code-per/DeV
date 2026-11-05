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

test("active goals are saved to disk and come back after a restart; cleared and met ones don't", async () => {
  const fs = await import("node:fs")
  const path = await import("node:path")
  const { Global } = await import("@dev-ai/core/global")
  const file = (id: string) => path.join(Global.Path.state, "goals", `${id}.json`)

  SessionGoal.apply("g-disk", { action: "set", objective: "the build is green" })
  SessionGoal.next("g-disk", "working on it")
  // A restart: a new process reads what the last one saved.
  fs.copyFileSync(file("g-disk"), file("g-restart"))
  expect(SessionGoal.get("g-restart")).toEqual({ objective: "the build is green", status: "active", rounds: 0 })

  SessionGoal.apply("g-disk", { action: "clear" })
  expect(fs.existsSync(file("g-disk"))).toBe(false)

  SessionGoal.apply("g-met", { action: "set", objective: "done" })
  SessionGoal.next("g-met", SessionGoal.MET_MARKER)
  SessionGoal.reviewed("g-met", "VERDICT: MET")
  expect(fs.existsSync(file("g-met"))).toBe(false)

  fs.writeFileSync(file("g-bad"), "not json")
  expect(SessionGoal.get("g-bad")).toBeUndefined()
})

test("a goal judged impossible by the reviewer ends with the reason; a lazy claim the reviewer rejects does not", () => {
  SessionGoal.apply("g-imp", { action: "set", objective: "deploy to the production cluster" })
  const claim = SessionGoal.next("g-imp", `${SessionGoal.IMPOSSIBLE_MARKER}: there are no cluster credentials here`)
  expect(claim?.type).toBe("review")
  expect(claim?.type === "review" && claim.prompt).toContain("no cluster credentials")

  // The reviewer disagrees: the agent keeps working.
  expect(SessionGoal.reviewed("g-imp", "Credentials are in deploy/.kubeconfig.\nVERDICT: NOT MET - try them")).toContain("try them")
  expect(SessionGoal.get("g-imp")?.status).toBe("active")

  SessionGoal.next("g-imp", `${SessionGoal.IMPOSSIBLE_MARKER}: the kubeconfig is expired`)
  expect(SessionGoal.reviewed("g-imp", "Checked it.\nVERDICT: IMPOSSIBLE the cluster was deleted")).toBeUndefined()
  expect(SessionGoal.get("g-imp")).toMatchObject({ status: "impossible", reason: "the cluster was deleted" })
  expect(SessionGoal.next("g-imp", "anything")).toBeUndefined()
})
