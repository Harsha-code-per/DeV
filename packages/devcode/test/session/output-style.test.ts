import { expect, test } from "bun:test"
import path from "path"
import { OutputStyle } from "../../src/session/output-style"
import { tmpdir } from "../fixture/fixture"

test("output styles: built-ins, a project's custom style, and the default", async () => {
  await using dir = await tmpdir()
  expect(await OutputStyle.text(undefined, dir.path)).toBeUndefined()
  expect(await OutputStyle.text("default", dir.path)).toBeUndefined()
  expect(await OutputStyle.text("learning", dir.path)).toContain("TODO(human)")
  await Bun.write(path.join(dir.path, ".dev", "output-styles", "pirate.md"), "Talk like a pirate.\n")
  expect(await OutputStyle.text("pirate", dir.path)).toBe("Output style: pirate.\nTalk like a pirate.")
  expect(await OutputStyle.text("missing", dir.path)).toBeUndefined()
})
