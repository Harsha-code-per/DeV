import { expect, test } from "bun:test"
import { retry } from "./src/retry"

function flaky(failures: number) {
  const state = { calls: 0 }
  const fn = async () => {
    state.calls++
    if (state.calls <= failures) throw new Error(`fail ${state.calls}`)
    return "ok"
  }
  return { state, fn }
}

test("resolves on first success", async () => {
  const f = flaky(0)
  expect(await retry(f.fn, 3)).toBe("ok")
  expect(f.state.calls).toBe(1)
})

test("retries async failures", async () => {
  const f = flaky(2)
  expect(await retry(f.fn, 3)).toBe("ok")
  expect(f.state.calls).toBe(3)
})

test("rejects with the last error after all attempts", async () => {
  const f = flaky(10)
  await expect(retry(f.fn, 4)).rejects.toThrow("fail 4")
  expect(f.state.calls).toBe(4)
})

test("single attempt", async () => {
  const f = flaky(1)
  await expect(retry(f.fn, 1)).rejects.toThrow("fail 1")
  expect(f.state.calls).toBe(1)
})

test("synchronous throws are retried too", async () => {
  const state = { calls: 0 }
  const fn = () => {
    state.calls++
    if (state.calls < 2) throw new Error("sync")
    return Promise.resolve(7)
  }
  expect(await retry(fn, 2)).toBe(7)
})

test("does not wait after the last attempt", async () => {
  const f = flaky(10)
  const start = performance.now()
  await expect(retry(f.fn, 2, 400)).rejects.toThrow("fail 2")
  // one wait of 400ms between the two attempts, not a second one at the end
  expect(performance.now() - start).toBeLessThan(750)
  expect(performance.now() - start).toBeGreaterThanOrEqual(380)
})

test("attempts below one is a RangeError", async () => {
  await expect(retry(flaky(0).fn, 0)).rejects.toBeInstanceOf(RangeError)
})
