import { afterAll, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@dev-ai/core/global"
import { Sandbox } from "../../src/sandbox"
import { tmpdir } from "../fixture/fixture"

// The real OS sandbox (bubblewrap). Tests disable it globally, so it is turned back on here.
const available = process.platform === "linux" && Boolean(Bun.which("bwrap"))
const outside = path.join(os.homedir(), `.dev-sandbox-test-${process.pid}`)

afterAll(() => fs.rm(outside, { force: true }))

async function sh(command: string, root: string, env?: Record<string, string>) {
  process.env["DEV_DISABLE_SANDBOX"] = "false"
  const wrapped = await Sandbox.wrap(command, [root], "/bin/bash").finally(() => {
    process.env["DEV_DISABLE_SANDBOX"] = "true"
  })
  expect(wrapped).toBeDefined()
  // Async spawn: the sandbox's network proxy runs in this process.
  const proc = Bun.spawn(["/bin/bash", "-c", wrapped!], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  })
  const result = { code: await proc.exited, out: await new Response(proc.stdout).text() }
  await Sandbox.cleanup()
  return result
}

describe.skipIf(!available)("shell sandbox", () => {
  test("writes inside the project, not outside it or to .env", async () => {
    await using dir = await tmpdir()
    expect((await sh("echo ok > inside.txt && cat inside.txt", dir.path)).out.trim()).toBe("ok")
    expect((await sh(`echo bad > ${outside}`, dir.path)).code).not.toBe(0)
    expect(await Bun.file(outside).exists()).toBe(false)
    expect((await sh("echo secret > .env", dir.path)).code).not.toBe(0)
  })

  test("leaves no placeholder files in the project", async () => {
    await using dir = await tmpdir()
    await sh("true", dir.path)
    expect(await fs.readdir(dir.path, { recursive: true })).toEqual(
      (await fs.readdir(dir.path, { recursive: true })).filter((file) => !file.startsWith(".bash") && file !== ".env"),
    )
  })

  test("git add -A works, and adds real files but no placeholders", async () => {
    await using dir = await tmpdir({ git: true })
    await Bun.write(path.join(dir.path, "real.txt"), "real")
    const result = await sh("git add -A && git diff --cached --name-only", dir.path, await Sandbox.env())
    expect(result.code).toBe(0)
    expect(result.out.trim()).toBe("real.txt")
  })

  test("cannot read DeV's key store", async () => {
    await using dir = await tmpdir()
    await Bun.write(path.join(Global.Path.data, "auth.json"), '{"key":"secret"}')
    const result = await sh(`cat ${path.join(Global.Path.data, "auth.json")}`, dir.path)
    expect(result.code).not.toBe(0)
    expect(result.out).not.toContain("secret")
  })
})

test("dev.json sandbox settings add hosts and paths and unhide chosen credentials", () => {
  const settings = {
    network: { allow: ["npm.mycompany.com"] },
    filesystem: { allowWrite: ["~/shared"], allowRead: ["~/.npmrc"] },
  }
  const defaults = Sandbox.config(["/work/app"])
  const custom = Sandbox.config(["/work/app"], settings)
  expect(defaults.filesystem.denyRead).toContain(path.join(os.homedir(), ".npmrc"))
  expect(custom.filesystem.denyRead).not.toContain(path.join(os.homedir(), ".npmrc"))
  expect(custom.filesystem.denyRead).toContain(path.join(os.homedir(), ".ssh"))
  expect(custom.network.allowedDomains).toContain("npm.mycompany.com")
  expect(custom.network.allowedDomains).toContain("registry.npmjs.org")
  expect(custom.filesystem.allowWrite).toContain(path.join(os.homedir(), "shared"))
})
