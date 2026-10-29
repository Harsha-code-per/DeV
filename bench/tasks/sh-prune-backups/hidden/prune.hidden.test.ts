import { afterAll, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const dirs: string[] = []
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

// Modification times run opposite to the dates in the names, so sorting by mtime gives the wrong answer.
function fixture(names: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-prune-"))
  dirs.push(dir)
  names.forEach((name, i) => {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), name)
    const t = new Date(Date.UTC(2020, 0, 1) - i * 86400_000)
    utimesSync(path.join(dir, name), t, t)
  })
  return dir
}
const list = (dir: string) => readdirSync(dir).sort()

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bash", "prune.sh", ...args])
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() }
}

test("keeps the newest per name by the date in the name", () => {
  const dir = fixture([
    "db-2026-10-01.tar.gz",
    "db-2026-10-03.tar.gz",
    "db-2026-09-15.tar.gz",
    "db-2025-12-31.tar.gz",
    "my-app-2026-01-01.tar.gz",
    "my-app-2026-02-01.tar.gz",
    "my-app-2025-02-01.tar.gz",
    "app-2026-01-01.tar.gz",
  ])
  expect(run(dir, "2")).toEqual({
    code: 0,
    out: "deleted db-2025-12-31.tar.gz\ndeleted db-2026-09-15.tar.gz\ndeleted my-app-2025-02-01.tar.gz\n",
    err: "",
  })
  expect(list(dir)).toEqual([
    "app-2026-01-01.tar.gz",
    "db-2026-10-01.tar.gz",
    "db-2026-10-03.tar.gz",
    "my-app-2026-01-01.tar.gz",
    "my-app-2026-02-01.tar.gz",
  ])
})

test("names with spaces and digits; other files and subdirectories untouched", () => {
  const dir = fixture([
    "nightly db-2026-03-01.tar.gz",
    "nightly db-2026-03-02.tar.gz",
    "v2-2026-03-01.tar.gz",
    "v2-2026-03-05.tar.gz",
    "v2-2026-03-05.tar.gz.part",
    "notes-2026-01-01.txt",
    "db-26-01-01.tar.gz",
    "old/db-2001-01-01.tar.gz",
    "old/db-2002-01-01.tar.gz",
  ])
  expect(run(dir, "1").out).toBe("deleted nightly db-2026-03-01.tar.gz\ndeleted v2-2026-03-01.tar.gz\n")
  expect(list(dir)).toEqual([
    "db-26-01-01.tar.gz",
    "nightly db-2026-03-02.tar.gz",
    "notes-2026-01-01.txt",
    "old",
    "v2-2026-03-05.tar.gz",
    "v2-2026-03-05.tar.gz.part",
  ])
  expect(readdirSync(path.join(dir, "old")).length).toBe(2)
})

test("dry run deletes nothing", () => {
  const names = ["x-2026-01-01.tar.gz", "x-2026-01-02.tar.gz", "x-2026-01-03.tar.gz"]
  const dir = fixture(names)
  expect(run("--dry-run", dir, "1")).toEqual({
    code: 0,
    out: "would delete x-2026-01-01.tar.gz\nwould delete x-2026-01-02.tar.gz\n",
    err: "",
  })
  expect(list(dir)).toEqual(names)
})

test("nothing to delete prints nothing", () => {
  const dir = fixture(["x-2026-01-01.tar.gz"])
  expect(run(dir, "3")).toEqual({ code: 0, out: "", err: "" })
})

test("bad arguments exit 2 and delete nothing", () => {
  const dir = fixture(["x-2026-01-01.tar.gz", "x-2026-01-02.tar.gz"])
  for (const args of [[], [dir], [dir, "0"], [dir, "-1"], [dir, "two"], ["/definitely/not/here", "1"]]) {
    const r = run(...args)
    expect({ args, code: r.code, out: r.out }).toEqual({ args, code: 2, out: "" })
    expect(r.err).not.toBe("")
  }
  expect(existsSync(path.join(dir, "x-2026-01-01.tar.gz"))).toBe(true)
})
