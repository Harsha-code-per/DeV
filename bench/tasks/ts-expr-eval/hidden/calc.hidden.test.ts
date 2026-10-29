import { expect, test } from "bun:test"
import { CalcError, evaluate } from "./src/calc"

function errorAt(source: string, vars: Record<string, number> = {}) {
  try {
    evaluate(source, vars)
  } catch (error) {
    expect(error).toBeInstanceOf(CalcError)
    return (error as CalcError).position
  }
  throw new Error(`expected ${JSON.stringify(source)} to throw`)
}

test("numbers and precedence", () => {
  expect(evaluate("42")).toBe(42)
  expect(evaluate("3.25")).toBe(3.25)
  expect(evaluate("1 + 2 * 3")).toBe(7)
  expect(evaluate("(1 + 2) * 3")).toBe(9)
  expect(evaluate("10 - 4 - 3")).toBe(3)
  expect(evaluate("100 / 10 / 5")).toBe(2)
  expect(evaluate("7 % 4 * 2")).toBe(6)
  expect(evaluate("2 + 3 % 2")).toBe(3)
  expect(evaluate("\t2*  (3+4)\t")).toBe(14)
  expect(evaluate("((((1))))")).toBe(1)
})

test("power and unary operators", () => {
  expect(evaluate("2^3^2")).toBe(512)
  expect(evaluate("(2^3)^2")).toBe(64)
  expect(evaluate("-2^2")).toBe(-4)
  expect(evaluate("(-2)^2")).toBe(4)
  expect(evaluate("2^-1")).toBe(0.5)
  expect(evaluate("2*-3")).toBe(-6)
  expect(evaluate("--3")).toBe(3)
  expect(evaluate("-+-3")).toBe(3)
  expect(evaluate("1 - -1")).toBe(2)
  expect(evaluate("2 * 3 ^ 2")).toBe(18)
  expect(evaluate("-3 % 2")).toBe(-1)
})

test("variables", () => {
  expect(evaluate("price * (1 + tax)", { price: 200, tax: 0.25 })).toBe(250)
  expect(evaluate("_x1 + y_2", { _x1: 1, y_2: 2 })).toBe(3)
  expect(evaluate("a ^ b", { a: 0, b: 0 })).toBe(1)
})

test("error positions for bad characters", () => {
  expect(errorAt("1 + $")).toBe(4)
  expect(errorAt(".5")).toBe(0)
  expect(errorAt("5.")).toBe(1)
  expect(errorAt("2 # 3")).toBe(2)
})

test("error positions for misplaced tokens", () => {
  expect(errorAt("1 +* 2")).toBe(3)
  expect(errorAt("* 2")).toBe(0)
  expect(errorAt("1 2")).toBe(2)
  expect(errorAt("(1 + 2))")).toBe(7)
  expect(errorAt(")")).toBe(0)
  expect(errorAt("()")).toBe(1)
  expect(errorAt("x y", { x: 1, y: 2 })).toBe(2)
  expect(errorAt("2 (3)")).toBe(2)
})

test("error positions for early end", () => {
  expect(errorAt("")).toBe(0)
  expect(errorAt("   ")).toBe(3)
  expect(errorAt("1 +")).toBe(3)
  expect(errorAt("(1 + 2")).toBe(6)
  expect(errorAt("2^")).toBe(2)
  expect(errorAt("-")).toBe(1)
})

test("unknown variables and division by zero", () => {
  expect(errorAt("1 + nope", { yes: 1 })).toBe(4)
  expect(errorAt("toString")).toBe(0)
  expect(errorAt("4 / (2 - 2)")).toBe(2)
  expect(errorAt("1 + 5 % 0")).toBe(6)
  expect(errorAt("1 / z", { z: 0 })).toBe(2)
  expect(evaluate("0 / 5")).toBe(0)
})
