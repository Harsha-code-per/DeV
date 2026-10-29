import { describe, expect, test } from "bun:test"
import { Installation } from "../../src/installation"

describe("installation", () => {
  test("any newer DeV Code release is an update", () => {
    expect(Installation.isUpdate("1.19.0", "1.19.1")).toBe(true)
    expect(Installation.isUpdate("1.19.0", "2.0.0")).toBe(true)
    expect(Installation.isUpdate("1.19.0", "1.19.0")).toBe(false)
    expect(Installation.isUpdate("1.19.0", "1.18.35")).toBe(false)
    expect(Installation.isUpdate("0.0.0-dev-202610110139", "0.0.0-dev-202610120000")).toBe(true)
    expect(Installation.isUpdate("local", "1.19.0")).toBe(true)
    expect(Installation.isUpdate("1.19.0", "not-a-version")).toBe(false)
  })

  test("a source checkout is never upgraded in place", async () => {
    expect(await Installation.method()).toBe("unknown")
    expect(Installation.upgrade("unknown", "1.0.0")).rejects.toThrow("running from source")
  })
})
