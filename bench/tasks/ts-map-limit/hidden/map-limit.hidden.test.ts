import { expect, test } from "bun:test"
import { mapLimit } from "./src/map-limit"

// Each call gets a promise the test settles by hand, so the order of events is fully deterministic.
function controlled<R>() {
  const started: number[] = []
  const settle: Record<number, { resolve: (v: R) => void; reject: (e: unknown) => void }> = {}
  const fn = (_item: unknown, index: number) =>
    new Promise<R>((resolve, reject) => {
      started.push(index)
      settle[index] = { resolve, reject }
    })
  return { started, settle, fn }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("results keep input order whatever the finish order", async () => {
  const c = controlled<string>()
  const done = mapLimit(["a", "b", "c"], 3, c.fn)
  await tick()
  c.settle[2].resolve("C")
  c.settle[0].resolve("A")
  c.settle[1].resolve("B")
  expect(await done).toEqual(["A", "B", "C"])
})

test("fn gets each item with its 0-based index", async () => {
  const seen: [string, number][] = []
  const out = await mapLimit(["x", "y", "z"], 2, async (item, index) => {
    seen.push([item, index])
    return item + index
  })
  expect(seen).toEqual([
    ["x", 0],
    ["y", 1],
    ["z", 2],
  ])
  expect(out).toEqual(["x0", "y1", "z2"])
})

test("never more than limit in flight, refills as soon as one finishes", async () => {
  const c = controlled<number>()
  const done = mapLimit([10, 20, 30, 40, 50], 2, c.fn)
  await tick()
  expect(c.started).toEqual([0, 1])
  c.settle[1].resolve(2)
  await tick()
  expect(c.started).toEqual([0, 1, 2])
  c.settle[2].resolve(3)
  await tick()
  expect(c.started).toEqual([0, 1, 2, 3])
  c.settle[0].resolve(1)
  await tick()
  expect(c.started).toEqual([0, 1, 2, 3, 4])
  c.settle[4].resolve(5)
  c.settle[3].resolve(4)
  expect(await done).toEqual([1, 2, 3, 4, 5])
})

test("limit larger than items", async () => {
  expect(await mapLimit([1, 2], 50, async (n) => n * 2)).toEqual([2, 4])
})

test("rejection stops new calls even when running calls finish later", async () => {
  const c = controlled<number>()
  const done = mapLimit([1, 2, 3, 4], 2, c.fn)
  const outcome = done.then(
    () => "resolved",
    (error) => error,
  )
  await tick()
  const boom = new Error("boom")
  c.settle[0].reject(boom)
  await tick()
  c.settle[1].resolve(2)
  await tick()
  await tick()
  expect(await outcome).toBe(boom)
  expect(c.started).toEqual([0, 1])
})

test("a synchronous throw is a failure", async () => {
  const calls: number[] = []
  const boom = new Error("sync")
  const done = mapLimit([1, 2, 3], 1, (n) => {
    calls.push(n)
    if (n === 2) throw boom
    return Promise.resolve(n)
  })
  await expect(done).rejects.toBe(boom)
  await tick()
  expect(calls).toEqual([1, 2])
})

test("empty items", async () => {
  let called = false
  expect(
    await mapLimit([], 3, async () => {
      called = true
    }),
  ).toEqual([])
  expect(called).toBe(false)
})

test("invalid limit rejects with RangeError", async () => {
  let called = false
  const fn = async () => {
    called = true
  }
  for (const limit of [0, -1, 1.5, Number.NaN]) {
    await expect(mapLimit([1, 2], limit, fn)).rejects.toBeInstanceOf(RangeError)
  }
  expect(called).toBe(false)
})
