import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtempSync, mkdirSync, cpSync, readdirSync, rmSync, writeFileSync, existsSync } from "fs"
import os from "os"
import path from "path"

// Runs the real launcher under Node against a local stand-in for a GitHub release.
const root = mkdtempSync(path.join(os.tmpdir(), "dev-launcher-"))
const platform = { darwin: "darwin", linux: "linux" }[process.platform as string]
const assets = new Map<string, Uint8Array>()
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    const body = assets.get(path.basename(new URL(request.url).pathname))
    return body ? new Response(Buffer.from(body)) : new Response("missing", { status: 404 })
  },
})

// Async on purpose: the fake release is served by this same process.
async function run(home: string, ...args: string[]) {
  const child = Bun.spawn(["node", path.join(root, "pkg/bin/devcode.mjs"), ...args], {
    env: { ...process.env, DEVCODE_HOME: home, DEVCODE_RELEASE_URL: `http://127.0.0.1:${server.port}` },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, exitCode }
}

beforeAll(async () => {
  mkdirSync(path.join(root, "pkg/bin"), { recursive: true })
  cpSync(path.join(import.meta.dir, "../../script/npm-launcher.mjs"), path.join(root, "pkg/bin/devcode.mjs"))
  writeFileSync(path.join(root, "pkg/package.json"), '{"version":"9.9.9","type":"module"}')
  const build = path.join(root, "build")
  mkdirSync(build)
  writeFileSync(path.join(build, "devcode"), '#!/bin/sh\necho "ran with $*"\nexit 7\n')
  const tarball = path.join(root, "a.tar.gz")
  await $`tar -czf ${tarball} -C ${build} .`.quiet()
  const body = new Uint8Array(await Bun.file(tarball).arrayBuffer())
  const sums: string[] = []
  // Every name the detection could choose on this machine.
  for (const arch of ["x64", "arm64"])
    for (const baseline of ["", "-baseline"])
      for (const musl of ["", "-musl"]) {
        const name = `devcode-${platform}-${arch}${baseline}${musl}.tar.gz`
        assets.set(name, body)
        sums.push(`${new Bun.CryptoHasher("sha256").update(body).digest("hex")}  ${name}`)
      }
  assets.set("SHA256SUMS", new TextEncoder().encode(sums.join("\n") + "\n"))
})

afterAll(() => {
  server.stop(true)
  rmSync(root, { recursive: true, force: true })
})

describe.skipIf(!platform)("npm launcher", () => {
  test("downloads once, verifies, then passes arguments and the exit code through", async () => {
    const home = path.join(root, "home-ok")
    const first = await run(home, "hello", "world")
    expect(first.stdout).toBe("ran with hello world\n")
    expect(first.exitCode).toBe(7)
    expect(first.stderr).toContain("Downloading DeV Code 9.9.9")

    const second = await run(home, "again")
    expect(second.stdout).toBe("ran with again\n")
    expect(second.stderr).toBe("")
  })

  test("refuses a tampered download and installs nothing", async () => {
    const original = new Map(assets)
    for (const [name, body] of assets) if (name.endsWith(".tar.gz")) assets.set(name, Uint8Array.from([...body, 1]))
    const home = path.join(root, "home-bad")
    const result = await run(home)
    for (const [name, body] of original) assets.set(name, body)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("failed its checksum")
    expect(existsSync(path.join(home, "npm", "9.9.9"))).toBe(false)
    expect(existsSync(path.join(home, "npm")) ? readdirSync(path.join(home, "npm")) : []).toEqual([])
  })

  test("says so plainly when the release isn't there", async () => {
    const missing = new Map(assets)
    assets.clear()
    const result = await run(path.join(root, "home-none"))
    for (const [name, body] of missing) assets.set(name, body)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("the server answered 404")
  })
})
