import { expect, test } from "bun:test"
import { SessionNudge } from "../../src/session/nudge"

test("a reply that only announces its next step gets a nudge, at most twice per message", () => {
  expect(SessionNudge.next("m1", "I'll look at the sample log, then write the script.")).toContain("Go ahead")
  expect(SessionNudge.next("m1", "Let me check the tests:")).toContain("Go ahead")
  expect(SessionNudge.next("m1", "Now I'll run them.")).toBeUndefined()
  // An empty final reply also gets a nudge.
  expect(SessionNudge.next("m3", "")).toContain("Go ahead")
})

test("real endings are left alone", () => {
  for (const reply of [
    "Done. The tests pass.",
    "Created notes.txt containing saffron.",
    "Should I also update the README?",
    "I fixed the bug. I'll leave the docs as they are.",
    "All set. Let me know if you want anything else.",
  ])
    expect(SessionNudge.next("m2", reply), reply).toBeUndefined()
})

test("a plan that only names plan_exit gets told to call it; other plan replies are left alone", () => {
  expect(SessionNudge.next("plan1", "Plan written.plan_exit", "plan")).toContain("call the plan_exit tool")
  expect(SessionNudge.next("plan2", "This module parses the config.", "plan")).toBeUndefined()
})
