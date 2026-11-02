import { afterAll, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { MemoryFiles } from "../../src/session/memory-files"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "devcode-memory-"))
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), text)
}

test("@path lines pull files in, relative to the importing file, nested and without loops", () => {
  write("docs/style.md", "Use tabs.\n@../docs/more.md")
  write("docs/more.md", "Name things plainly.\n@style.md")
  const out = MemoryFiles.expandImports("Intro\n@docs/style.md\n```\n@docs/style.md\n```", path.join(root, "DEV.md"), root)
  expect(out).toContain("Use tabs.")
  expect(out).toContain("Name things plainly.")
  // The loop back to style.md stays a plain line, and the copy inside the code block is left alone.
  expect(out.match(/Use tabs\./g)?.length).toBe(1)
  expect(out).toContain("```\n@docs/style.md\n```")
  expect(MemoryFiles.expandImports("@missing.md", path.join(root, "DEV.md"), root)).toBe("@missing.md")
})

test("rules load always, or only for matching paths", () => {
  write(".dev/rules/general.md", "Run the tests before you finish.")
  write(".claude/rules/api.md", "---\npaths:\n  - src/api/**/*.ts\n---\nEvery handler validates its input.")
  const rules = MemoryFiles.rules(root)
  expect(rules.map((rule) => [path.basename(rule.file), rule.paths])).toEqual([
    ["general.md", undefined],
    ["api.md", ["src/api/**/*.ts"]],
  ])
  const api = rules[1]!
  expect(api.body).toBe("Every handler validates its input.")
  expect(MemoryFiles.applies(api, "src/api/users/create.ts")).toBe(true)
  expect(MemoryFiles.applies(api, "src/web/page.ts")).toBe(false)
})

test("auto memory adds notes once, removes wrong ones, and loads the start of the file", () => {
  const file = MemoryFiles.autoFile(root, "/home/me/my app")
  expect(file).toBe(path.join(root, "memory", "home-me-my-app", "MEMORY.md"))
  expect(MemoryFiles.autoMemory(file)).toBeUndefined()
  MemoryFiles.remember(file, { note: "Use pnpm, not npm." })
  MemoryFiles.remember(file, { note: "Use  pnpm, not npm. " })
  MemoryFiles.remember(file, { note: "Tests live in spec/." })
  expect(MemoryFiles.autoMemory(file)).toBe("- Use pnpm, not npm.\n- Tests live in spec/.")
  expect(MemoryFiles.remember(file, { remove: "spec/" })).toEqual({ removed: 1, saved: 1 })
  expect(MemoryFiles.autoMemory(file)).toBe("- Use pnpm, not npm.")
})
