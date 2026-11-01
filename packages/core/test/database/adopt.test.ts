import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { Database } from "../../src/database/database"

test("sessions in the old database move to the new name, with its journal files", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-adopt-"))
  writeFileSync(join(dir, "opencode.db"), "sessions")
  writeFileSync(join(dir, "opencode.db-wal"), "journal")

  expect(Database.adopt(dir, "dev.db", "opencode.db")).toBe(join(dir, "dev.db"))
  expect(readFileSync(join(dir, "dev.db"), "utf8")).toBe("sessions")
  expect(readFileSync(join(dir, "dev.db-wal"), "utf8")).toBe("journal")
  expect(existsSync(join(dir, "opencode.db"))).toBe(false)
  rmSync(dir, { recursive: true })
})

test("an existing new database is never replaced", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-adopt-"))
  writeFileSync(join(dir, "dev.db"), "new")
  writeFileSync(join(dir, "opencode.db"), "old")

  Database.adopt(dir, "dev.db", "opencode.db")
  expect(readFileSync(join(dir, "dev.db"), "utf8")).toBe("new")
  expect(existsSync(join(dir, "opencode.db"))).toBe(true)
  rmSync(dir, { recursive: true })
})
