import { afterEach, expect, test } from "bun:test"
import { defaults } from "./src/defaults"
import { mergeConfig } from "./src/merge"

const pristine = structuredClone(defaults)
afterEach(() => {
  expect(({} as Record<string, unknown>).admin).toBeUndefined()
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})

test("merges nested objects with later values winning", () => {
  expect(mergeConfig({ a: 1, n: { x: 1, y: 2 } }, { n: { y: 3, z: 4 } }, { a: 2, n: { z: 5 } })).toEqual({
    a: 2,
    n: { x: 1, y: 3, z: 5 },
  })
  expect(mergeConfig({ a: 1 })).toEqual({ a: 1 })
})

test("never mutates base or overrides", () => {
  const override = { server: { port: 9000, tls: { enabled: true } } }
  const overrideCopy = structuredClone(override)
  const merged = mergeConfig(defaults, override)
  expect(merged).toEqual({ server: { port: 9000, hosts: ["localhost"], tls: { enabled: true } }, log: { level: "info" } })
  expect(defaults).toEqual(pristine)
  expect(override).toEqual(overrideCopy)
  expect(mergeConfig(defaults)).toEqual(pristine)
})

test("result shares no objects or arrays with the inputs", () => {
  const override = { extra: { list: [1, { deep: true }] } }
  const merged = mergeConfig(defaults, override) as {
    server: { tls: { enabled: boolean }; hosts: string[] }
    log: { level: string }
    extra: { list: [number, { deep: boolean }, ...number[]] }
  }
  merged.server.tls.enabled = true
  merged.server.hosts.push("evil")
  merged.log.level = "debug"
  merged.extra.list[1].deep = false
  merged.extra.list.push(2)
  expect(defaults).toEqual(pristine)
  expect(override).toEqual({ extra: { list: [1, { deep: true }] } })
})

test("arrays are replaced, not merged", () => {
  expect(mergeConfig({ a: ["a", "b"] }, { a: ["c"] })).toEqual({ a: ["c"] })
  expect(mergeConfig({ a: { b: 1 } }, { a: [1, 2] })).toEqual({ a: [1, 2] })
  expect(mergeConfig({ a: [1, 2] }, { a: { b: 1 } })).toEqual({ a: { b: 1 } })
})

test("undefined is ignored and null deletes", () => {
  const merged = mergeConfig({ a: 1, b: 2, n: { x: 1, y: 2 } }, { a: undefined, b: null, n: { x: null }, c: null })
  expect(merged).toEqual({ a: 1, n: { y: 2 } })
  expect(Object.keys(merged)).toEqual(["a", "n"])
  expect(mergeConfig({ a: 1 }, { a: null }, { a: 3 })).toEqual({ a: 3 })
})

test("prototype pollution keys are skipped at every depth", () => {
  const evil = JSON.parse('{"__proto__": {"admin": true}, "nested": {"__proto__": {"polluted": 1}, "ok": 1}, "constructor": {"prototype": {"admin": true}}}')
  const merged = mergeConfig({}, evil)
  expect(merged).toEqual({ nested: { ok: 1 } })
  expect(Object.keys(merged)).toEqual(["nested"])
  expect(Object.hasOwn(merged, "__proto__")).toBe(false)
  expect(Object.hasOwn(merged.nested as object, "__proto__")).toBe(false)
  expect((merged as Record<string, unknown>).admin).toBeUndefined()
  const viaBase = mergeConfig(JSON.parse('{"__proto__": {"admin": true}, "prototype": 1, "keep": 2}'))
  expect(Object.keys(viaBase)).toEqual(["keep"])
  expect(Object.getPrototypeOf(viaBase)).toBe(Object.prototype)
})

test("non-plain values are used as they are", () => {
  class Point {
    constructor(public x: number) {}
  }
  const date = new Date(0)
  const point = new Point(1)
  const fn = () => 1
  const merged = mergeConfig({ when: { a: 1 }, p: new Point(5), keep: "x" }, { when: date, p: point, fn })
  expect(merged.when).toBe(date)
  expect(merged.p).toBe(point)
  expect(merged.fn).toBe(fn)
  expect(merged.keep).toBe("x")
  expect(mergeConfig({ a: { b: 1 } }, { a: 5 })).toEqual({ a: 5 })
  expect(mergeConfig({ a: 5 }, { a: { b: 1 } })).toEqual({ a: { b: 1 } })
})

test("null-prototype objects count as plain", () => {
  const bare = Object.create(null)
  bare.x = { y: 1 }
  const merged = mergeConfig({ x: { z: 2 } }, bare)
  expect(merged).toEqual({ x: { y: 1, z: 2 } })
  expect(merged.x).not.toBe(bare.x)
})
