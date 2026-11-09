import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { save } from "../../src/tool/artifact"

describe("artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-"))

  test("a page lands in its project's folder, and the same name replaces it", () => {
    const first = save(root, "/home/me/My Shop", { name: "Test coverage report", html: "<!doctype html><p>one</p>" })
    expect(first).toBe(path.join(root, "my-shop", "test-coverage-report.html"))
    const again = save(root, "/home/me/My Shop", { name: "test coverage report", html: "<!DOCTYPE html><p>two</p>" })
    expect(again).toBe(first)
    expect(fs.readFileSync(first, "utf8")).toBe("<!DOCTYPE html><p>two</p>")
  })

  test("a fragment is wrapped in a complete document with its name as the title", () => {
    const file = save(root, "/p", { name: "Q3 <numbers>", html: "<h1>Hi</h1>" })
    const page = fs.readFileSync(file, "utf8")
    expect(page).toStartWith("<!doctype html>")
    expect(page).toContain("<title>Q3 &#60;numbers&#62;</title>")
    expect(page).toContain("<h1>Hi</h1>")
  })

  test("a name made only of symbols still gets a file", () => {
    expect(path.basename(save(root, "/p", { name: "???", html: "<html></html>" }))).toBe("page.html")
  })
})
