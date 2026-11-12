import { afterAll, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { prune, save } from "../../src/tool/artifact"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-artifacts-"))
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

test("pages older than 30 days are removed, newer ones stay", () => {
  const old = save(root, "/work/shop", { name: "old report", html: "<p>old</p>" })
  const fresh = save(root, "/work/shop", { name: "new report", html: "<p>new</p>" })
  const gone = save(root, "/work/blog", { name: "draft", html: "<p>draft</p>" })
  const day = 24 * 60 * 60 * 1000
  fs.utimesSync(old, new Date(Date.now() - 31 * day), new Date(Date.now() - 31 * day))
  fs.utimesSync(gone, new Date(Date.now() - 40 * day), new Date(Date.now() - 40 * day))
  prune(root)
  expect(fs.existsSync(old)).toBe(false)
  expect(fs.existsSync(fresh)).toBe(true)
  expect(fs.existsSync(path.dirname(gone))).toBe(false)
})
