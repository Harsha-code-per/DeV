import { expect, test } from "bun:test"
import { gaps, mergeRanges } from "./src/ranges"

const r = (start: number, end: number) => ({ start, end })

test("merge basics", () => {
  expect(mergeRanges([])).toEqual([])
  expect(mergeRanges([r(1, 3), r(3, 5)])).toEqual([r(1, 5)])
  expect(mergeRanges([r(1, 10), r(2, 3), r(4, 5)])).toEqual([r(1, 10)])
  expect(mergeRanges([r(5, 6), r(1, 2), r(3, 4)])).toEqual([r(1, 2), r(3, 4), r(5, 6)])
  expect(mergeRanges([r(4, 4), r(7, 2), r(1, 2)])).toEqual([r(1, 2)])
  expect(mergeRanges([r(-5, -1), r(-2, 0)])).toEqual([r(-5, 0)])
  expect(mergeRanges([r(1, 2), r(1, 2)])).toEqual([r(1, 2)])
})

test("merge does not touch its input and returns new objects", () => {
  const input = [r(3, 4), r(1, 3)]
  const copy = structuredClone(input)
  const out = mergeRanges(input)
  expect(input).toEqual(copy)
  const single = [r(1, 2)]
  expect(mergeRanges(single)[0]).not.toBe(single[0])
  expect(out).toEqual([r(1, 4)])
})

test("gaps", () => {
  expect(gaps([], 0, 10)).toEqual([r(0, 10)])
  expect(gaps([r(-5, 3), r(8, 20)], 0, 10)).toEqual([r(3, 8)])
  expect(gaps([r(0, 10)], 0, 10)).toEqual([])
  expect(gaps([r(2, 3), r(3, 4), r(6, 7)], 0, 10)).toEqual([r(0, 2), r(4, 6), r(7, 10)])
  expect(gaps([r(20, 30)], 0, 10)).toEqual([r(0, 10)])
  expect(gaps([r(1, 2)], 5, 5)).toEqual([])
})

// Runs in a child process so a slow implementation fails at the timeout instead of hanging the suite.
test("200,000 ranges are fast", () => {
  const script = `
    import { gaps, mergeRanges } from "./src/ranges.ts"
    const n = 200_000
    const ranges = []
    for (let i = 0; i < n; i++) ranges.push({ start: i * 10, end: i * 10 + 5 })
    for (let i = 0; i < n; i += 100) ranges.push({ start: i * 10 + 5, end: i * 10 + 10 })
    let seed = 42
    for (let i = ranges.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      const j = seed % (i + 1)
      ;[ranges[i], ranges[j]] = [ranges[j], ranges[i]]
    }
    const merged = mergeRanges(ranges)
    const free = gaps(ranges, -10, n * 10 + 10)
    console.log(JSON.stringify({ merged: merged.length, first: merged[0], second: merged[1], last: merged.at(-1), free: free.length, freeFirst: free[0], freeLast: free.at(-1) }))
  `
  const proc = Bun.spawnSync({ cmd: ["bun", "-e", script], timeout: 10_000 })
  expect(proc.exitCode).toBe(0)
  expect(JSON.parse(proc.stdout.toString())).toEqual({
    merged: 198_000,
    first: r(0, 15),
    second: r(20, 25),
    last: r(1_999_990, 1_999_995),
    free: 198_001,
    freeFirst: r(-10, 0),
    freeLast: r(1_999_995, 2_000_010),
  })
}, 20_000)
