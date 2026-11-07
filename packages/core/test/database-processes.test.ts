import { expect, test } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"

const writer = path.join(import.meta.dir, "fixture", "database-writer.ts")
const spawn = (file: string) =>
  Bun.spawn(["bun", writer, file], { cwd: path.resolve(import.meta.dir, ".."), stderr: "pipe" })

// Several DeV processes share one database (two terminals, `devcode run` beside the TUI, parallel runs).
// A transaction that reads and then writes must wait for the others instead of failing "database is locked".
test("separate processes writing to the same database at once all succeed", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-db-processes-"))
  const file = path.join(dir, "dev.db")
  try {
    // One process creates the schema first, as the first DeV start on a machine does.
    const first = spawn(file)
    expect({ code: await first.exited, err: await new Response(first.stderr).text() }).toMatchObject({ code: 0 })
    const results = await Promise.all(
      Array.from({ length: 6 }, () => spawn(file)).map(async (proc) => ({
        code: await proc.exited,
        err: await new Response(proc.stderr).text(),
      })),
    )
    expect(results.filter((result) => result.code !== 0).map((result) => result.err.slice(-300))).toEqual([])
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}, 60_000)
