import { expect, test } from "bun:test"
import { Emitter } from "./src/emitter"

test("calls listeners in order with args", () => {
  const e = new Emitter()
  const log: string[] = []
  e.on("x", (a, b) => log.push(`1:${a}${b}`))
  e.on("x", (a) => log.push(`2:${a}`))
  expect(e.emit("x", "a", "b")).toBe(true)
  expect(log).toEqual(["1:ab", "2:a"])
  expect(e.emit("nothing")).toBe(false)
})

test("a once listener removing itself does not skip the next listener", () => {
  const e = new Emitter()
  const log: string[] = []
  e.once("x", () => log.push("once"))
  e.on("x", () => log.push("next"))
  e.on("x", () => log.push("last"))
  e.emit("x")
  e.emit("x")
  expect(log).toEqual(["once", "next", "last", "next", "last"])
})

test("listeners added during emit wait for the next emit", () => {
  const e = new Emitter()
  const log: string[] = []
  e.on("x", () => {
    log.push("a")
    e.on("x", () => log.push("late"))
  })
  e.emit("x")
  expect(log).toEqual(["a"])
  e.emit("x")
  expect(log).toEqual(["a", "a", "late"])
})

test("listeners removed during emit before their turn are not called", () => {
  const e = new Emitter()
  const log: string[] = []
  const c = () => log.push("c")
  let offB = () => {}
  e.on("x", () => {
    log.push("a")
    offB()
    e.off("x", c)
  })
  offB = e.on("x", () => log.push("b"))
  e.on("x", c)
  e.on("x", () => log.push("d"))
  e.emit("x")
  expect(log).toEqual(["a", "d"])
  expect(e.listenerCount("x")).toBe(2)
})

test("emit return value", () => {
  const e = new Emitter()
  const b = () => {}
  let first = true
  e.on("x", () => {
    if (first) e.off("x", b)
    first = false
  })
  e.on("x", b)
  expect(e.emit("x")).toBe(true)
  const lone = new Emitter()
  const f = () => {}
  lone.on("y", f)
  lone.off("y", f)
  expect(lone.emit("y")).toBe(false)
})

test("off removes a once listener by its original function", () => {
  const e = new Emitter()
  let calls = 0
  const fn = () => calls++
  e.once("x", fn)
  expect(e.listenerCount("x")).toBe(1)
  e.off("x", fn)
  expect(e.listenerCount("x")).toBe(0)
  e.emit("x")
  expect(calls).toBe(0)
})

test("once runs at most once even with re-entrant emits", () => {
  const e = new Emitter()
  let calls = 0
  e.once("x", () => {
    calls++
    e.emit("x")
  })
  e.emit("x")
  e.emit("x")
  expect(calls).toBe(1)
  expect(e.listenerCount("x")).toBe(0)
})

test("unsubscribe functions from on and once, called twice", () => {
  const e = new Emitter()
  const log: string[] = []
  const fn = () => log.push("fn")
  const off1 = e.on("x", fn)
  e.on("x", fn)
  const offOnce = e.once("x", () => log.push("once"))
  off1()
  off1()
  offOnce()
  expect(e.listenerCount("x")).toBe(1)
  e.emit("x")
  expect(log).toEqual(["fn"])
})

test("duplicate registrations; off removes the earliest", () => {
  const e = new Emitter()
  const log: string[] = []
  const fn = (tag: unknown) => log.push(`fn${tag}`)
  e.on("x", fn)
  e.on("x", () => log.push("mid"))
  e.on("x", fn)
  e.emit("x", 1)
  expect(log).toEqual(["fn1", "mid", "fn1"])
  e.off("x", fn)
  e.emit("x", 2)
  expect(log).toEqual(["fn1", "mid", "fn1", "mid", "fn2"])
})

test("a throwing listener does not stop the others; first error is rethrown", () => {
  const e = new Emitter()
  const log: string[] = []
  const first = new Error("first")
  e.on("x", () => {
    throw first
  })
  e.on("x", () => log.push("b"))
  e.on("x", () => {
    throw new Error("second")
  })
  e.on("x", () => log.push("d"))
  expect(() => e.emit("x")).toThrow(first)
  expect(log).toEqual(["b", "d"])
})

test("events are independent", () => {
  const e = new Emitter()
  const log: string[] = []
  e.once("a", () => log.push("a"))
  e.on("b", () => log.push("b"))
  e.emit("b")
  e.emit("a")
  e.emit("a")
  expect(log).toEqual(["b", "a"])
  expect(e.listenerCount("a")).toBe(0)
  expect(e.listenerCount("b")).toBe(1)
})
