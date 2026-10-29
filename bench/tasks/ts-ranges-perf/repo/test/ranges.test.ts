import { expect, test } from "bun:test"
import { gaps, mergeRanges } from "../src/ranges"

test("merges overlapping and touching ranges", () => {
  expect(
    mergeRanges([
      { start: 5, end: 8 },
      { start: 1, end: 3 },
      { start: 2, end: 4 },
      { start: 8, end: 9 },
    ]),
  ).toEqual([
    { start: 1, end: 4 },
    { start: 5, end: 9 },
  ])
})

test("gaps inside a window", () => {
  expect(gaps([{ start: 2, end: 4 }], 0, 10)).toEqual([
    { start: 0, end: 2 },
    { start: 4, end: 10 },
  ])
})
