import { expect, test } from "bun:test"
import { initials, truncate } from "./src/text"

const family = "👨‍👩‍👧‍👦"
const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].length

test("ascii truncate", () => {
  expect(truncate("hello", 5)).toBe("hello")
  expect(truncate("hello!", 5)).toBe("hell…")
  expect(truncate("hello", 1)).toBe("…")
})

test("whitespace before the ellipsis is removed", () => {
  expect(truncate("hello world", 7)).toBe("hello…")
  expect(truncate("ab   cdef", 5)).toBe("ab…")
})

test("emoji, flags and combining marks count as one character", () => {
  expect(truncate(`${family}${family}${family}`, 3)).toBe(`${family}${family}${family}`)
  expect(truncate(`${family} family`, 3)).toBe(`${family}…`)
  expect(truncate("🇩🇪🇫🇷🇮🇹", 2)).toBe("🇩🇪…")
  expect(truncate("🇩🇪🇫🇷", 2)).toBe("🇩🇪🇫🇷")
  expect(truncate("café au lait", 5)).toBe("café…")
  expect(truncate("👍🏽👍🏽👍🏽👍🏽", 3)).toBe("👍🏽👍🏽…")
})

test("result never splits a character and has max characters", () => {
  const text = "😀a🇯🇵é👩🏽‍💻xyz"
  for (let max = 1; max <= 8; max++) {
    const out = truncate(text, max)
    expect(out.includes("�")).toBe(false)
    expect(graphemes(out)).toBe(Math.min(max, graphemes(text)))
    expect(text.startsWith(out.replace(/…$/, ""))).toBe(true)
  }
})

test("max below 1 throws RangeError", () => {
  expect(() => truncate("abc", 0)).toThrow(RangeError)
  expect(() => truncate("", -1)).toThrow(RangeError)
})

test("initials ascii and whitespace", () => {
  expect(initials("ada lovelace")).toBe("AL")
  expect(initials("  grace \t\n  brewster   hopper ")).toBe("GB")
  expect(initials("plato")).toBe("P")
  expect(initials("   ")).toBe("")
  expect(initials("")).toBe("")
})

test("initials keep whole characters", () => {
  expect(initials("émile zola")).toBe("ÉZ")
  expect(initials("émile zola")).toBe("ÉZ")
  expect(initials("🎉 party")).toBe("🎉P")
  expect(initials(`${family} smith`)).toBe(`${family}S`)
  expect(initials("🇯🇵 tanaka")).toBe("🇯🇵T")
})
