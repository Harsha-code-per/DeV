import { expect, test } from "bun:test"
import { describeEvery, parseLoop } from "../src/routes/session/loop"

test("reads an interval and a prompt", () => {
  expect(parseLoop("5m check the deploy")).toEqual({ every: 300_000, text: "check the deploy" })
  expect(parseLoop("every 2 hours: summarise new issues")).toEqual({ every: 7_200_000, text: "summarise new issues" })
  expect(parseLoop("90s run the tests")).toEqual({ every: 90_000, text: "run the tests" })
  expect(parseLoop("10s too fast")).toBeUndefined()
  expect(parseLoop("check the deploy")).toBeUndefined()
  expect(describeEvery(300_000)).toBe("5m")
  expect(describeEvery(90_000)).toBe("90s")
})
