import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const dirs: string[] = []
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-logs-"))
  dirs.push(dir)
  Object.entries(files).forEach(([name, text]) => {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), text)
  })
  return dir
}

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bash", "errors.sh", ...args])
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() }
}

test("sample logs", () => {
  expect(run("logs")).toEqual({ code: 0, out: "api 2\ndb 1\n", err: "" })
})

test("sorting, ties, skipping and other files", () => {
  const dir = fixture({
    "b.log": "ERROR one\nERROR two\n",
    "a.log": "x ERROR\nok\nERROR\n",
    "c.log": "error lowercase\nERRORS plural\nINFO\n",
    "d.log": "ERROR only\n",
    "notes.txt": "ERROR\nERROR\nERROR\n",
    "nested/e.log": "ERROR\nERROR\nERROR\n",
    "with space.log": "ERROR a\nERROR b\nERROR c\n",
  })
  expect(run(dir)).toEqual({ code: 0, out: "with space 3\na 2\nb 2\nd 1\n", err: "" })
})

test("no errors prints nothing", () => {
  expect(run(fixture({ "quiet.log": "INFO\n" }))).toEqual({ code: 0, out: "", err: "" })
})

test("missing or bad argument", () => {
  const missing = run()
  expect(missing.code).toBe(2)
  expect(missing.out).toBe("")
  expect(missing.err).not.toBe("")
  expect(run("/definitely/not/here").code).toBe(2)
})
