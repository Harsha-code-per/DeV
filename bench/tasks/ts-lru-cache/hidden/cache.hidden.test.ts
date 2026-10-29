import { expect, test } from "bun:test"
import { Cache } from "./src/cache"

test("evicts the least recently set entry", () => {
  const cache = new Cache<string, number>(2)
  cache.set("a", 1)
  cache.set("b", 2)
  cache.set("c", 3)
  expect(cache.has("a")).toBe(false)
  expect(cache.get("b")).toBe(2)
  expect(cache.get("c")).toBe(3)
  expect(cache.size).toBe(2)
})

test("get counts as a use", () => {
  const cache = new Cache<string, number>(2)
  cache.set("a", 1)
  cache.set("b", 2)
  cache.get("a")
  cache.set("c", 3)
  expect(cache.has("a")).toBe(true)
  expect(cache.has("b")).toBe(false)
})

test("set of an existing key updates it and counts as a use", () => {
  const cache = new Cache<string, number>(2)
  cache.set("a", 1)
  cache.set("b", 2)
  cache.set("a", 10)
  cache.set("c", 3)
  expect(cache.get("a")).toBe(10)
  expect(cache.has("b")).toBe(false)
  expect(cache.size).toBe(2)
})

test("has does not count as a use", () => {
  const cache = new Cache<string, number>(2)
  cache.set("a", 1)
  cache.set("b", 2)
  cache.has("a")
  cache.set("c", 3)
  expect(cache.has("a")).toBe(false)
})

test("capacity one", () => {
  const cache = new Cache<string, number>(1)
  cache.set("a", 1)
  cache.set("b", 2)
  expect(cache.get("a")).toBeUndefined()
  expect(cache.get("b")).toBe(2)
  expect(cache.size).toBe(1)
})

test("rejects capacity below one", () => {
  expect(() => new Cache(0)).toThrow(RangeError)
  expect(() => new Cache(-3)).toThrow(RangeError)
})
