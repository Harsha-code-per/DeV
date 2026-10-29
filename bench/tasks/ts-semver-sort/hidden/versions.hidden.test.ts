import { expect, test } from "bun:test"
import { compareVersions, sortVersions } from "./src/versions"

const sign = (a: string, b: string) => Math.sign(compareVersions(a, b))

test("numeric parts", () => {
  expect(sign("1.10.0", "1.9.0")).toBe(1)
  expect(sign("1.9.0", "1.10.0")).toBe(-1)
  expect(sign("10.0.0", "9.99.99")).toBe(1)
  expect(sign("1.2.3", "1.2.3")).toBe(0)
  expect(sign("v1.2.3", "1.2.3")).toBe(0)
  expect(sign("0.0.10", "0.0.9")).toBe(1)
})

test("pre-release is older than the release", () => {
  expect(sign("2.0.0-rc.1", "2.0.0")).toBe(-1)
  expect(sign("2.0.0", "2.0.0-rc.1")).toBe(1)
  expect(sign("2.0.0-rc.1", "1.9.9")).toBe(1)
})

test("spec ordering of pre-releases", () => {
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ]
  for (let i = 0; i < ordered.length; i++)
    for (let j = 0; j < ordered.length; j++) expect([ordered[i], ordered[j], sign(ordered[i], ordered[j])]).toEqual([ordered[i], ordered[j], Math.sign(i - j)])
})

test("identifier details", () => {
  expect(sign("1.0.0-2", "1.0.0-10")).toBe(-1)
  expect(sign("1.0.0-999", "1.0.0-a")).toBe(-1)
  expect(sign("1.0.0-B", "1.0.0-a")).toBe(-1)
  expect(sign("1.0.0-a1", "1.0.0-a10")).toBe(-1)
  expect(sign("1.0.0-x-y", "1.0.0-x")).toBe(1)
  expect(sign("1.0.0-alpha.1.1", "1.0.0-alpha.1")).toBe(1)
})

test("build metadata is ignored", () => {
  expect(sign("1.0.0+build.5", "1.0.0+build.9")).toBe(0)
  expect(sign("1.0.0-rc.1+x", "1.0.0-rc.1")).toBe(0)
  expect(sign("1.0.0+zzz", "1.0.1")).toBe(-1)
})

test("sortVersions is stable, oldest first, and does not mutate", () => {
  const input = ["1.10.0", "1.0.0+b", "v1.2.0", "1.0.0-rc.1", "1.0.0+a", "1.9.0", "1.0.0"]
  const copy = [...input]
  expect(sortVersions(input)).toEqual(["1.0.0-rc.1", "1.0.0+b", "1.0.0+a", "1.0.0", "v1.2.0", "1.9.0", "1.10.0"])
  expect(input).toEqual(copy)
})

test("invalid versions throw", () => {
  for (const bad of ["1.2", "1.2.x", "1.2.3-", "1.2.3-a..b", "", "a.b.c", "1.2.3.4", "1.2.3+"])
    expect(() => compareVersions(bad, "1.0.0")).toThrow()
  expect(() => compareVersions("1.0.0", "nope")).toThrow()
})
