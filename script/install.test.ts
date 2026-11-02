// Run from script/: the root bunfig refuses tests from the repo root.
import { afterAll, describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, rm } from "fs/promises"
import os from "os"
import path from "path"

const script = path.resolve(import.meta.dir, "../install")
const root = await mkdtemp(path.join(os.tmpdir(), "devcode-install-test-"))
afterAll(() => rm(root, { recursive: true, force: true }))

// Stands in for curl: serves files from $SERVE by name and logs each URL; anything missing is a 404.
const curl = `#!/bin/sh
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
echo "$url" >> "$CURL_LOG"
[ -f "$SERVE/\${url##*/}" ] || exit 22
cp "$SERVE/\${url##*/}" "$out"
`
const bin = path.join(root, "bin")
await Bun.write(path.join(bin, "curl"), curl)
await $`chmod +x ${path.join(bin, "curl")}`

// A release with every Linux and macOS archive name, each holding a devcode that prints its version.
async function release(name: string, sums?: (text: string) => string) {
  const serve = path.join(root, name)
  await Bun.write(path.join(serve, "payload", "devcode"), "#!/bin/sh\necho 9.9.9\n")
  await $`chmod +x ${path.join(serve, "payload", "devcode")}`
  const assets = ["linux", "darwin"].flatMap((os) =>
    ["x64", "arm64"].flatMap((arch) =>
      ["", "-baseline"].flatMap((variant) =>
        ["", "-musl"].map((libc) => `devcode-${os}-${arch}${variant}${libc}.tar.gz`),
      ),
    ),
  )
  for (const asset of assets) await $`tar -czf ${path.join(serve, asset)} -C ${path.join(serve, "payload")} .`
  const text = await $`sha256sum ${assets}`.cwd(serve).text()
  await Bun.write(path.join(serve, "SHA256SUMS"), sums ? sums(text) : text)
  return serve
}

async function install(serve: string, args: string[] = [], home?: string) {
  home ??= await mkdtemp(path.join(root, "home-"))
  const log = path.join(home, "curl.log")
  const proc = Bun.spawn(["sh", script, ...args], {
    env: { PATH: `${bin}:/usr/bin:/bin`, SHELL: "/bin/sh", HOME: home, TMPDIR: home, CURL_LOG: log, SERVE: serve },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  const dir = path.join(home, ".devcode", "bin")
  return {
    home,
    code,
    output: stdout + stderr,
    urls: (await Bun.file(log).text()).trim().split("\n"),
    dir,
    installed: await Bun.file(path.join(dir, "devcode")).exists(),
  }
}

describe.skipIf(process.platform === "win32")("install script", () => {
  test("installs the latest release as devcode", async () => {
    const result = await install(await release("latest"))
    expect(result.code).toBe(0)
    expect(
      result.urls.every((url) => url.startsWith("https://github.com/Harsha-code-per/DeV/releases/latest/download/")),
    ).toBe(true)
    expect(await $`${path.join(result.dir, "devcode")}`.text()).toBe("9.9.9\n")
    expect(await Bun.file(path.join(result.dir, "dev")).exists()).toBe(false)
    expect(result.output).toContain("Installed DeV Code 9.9.9")
    // SHELL is plain sh here, so the POSIX startup file gets the PATH line, once even after a reinstall.
    await install(await release("again"), [], result.home)
    const profile = await Bun.file(path.join(result.home, ".profile")).text()
    expect(profile.split(`export PATH="${result.dir}:$PATH"`).length - 1).toBe(1)
  })

  test("installs a given version", async () => {
    const result = await install(await release("pinned"), ["v1.2.3"])
    expect(result.code).toBe(0)
    expect(result.urls.at(-1)).toContain("/releases/download/v1.2.3/devcode-")
  })

  test("refuses an archive whose checksum doesn't match", async () => {
    const result = await install(await release("tampered", (text) => text.replace(/^[0-9a-f]{64}/gm, "0".repeat(64))))
    expect(result.code).toBe(1)
    expect(result.output).toContain("checksum mismatch")
    expect(result.installed).toBe(false)
  })

  test("explains a missing release", async () => {
    const result = await install(path.join(root, "nothing"))
    expect(result.code).toBe(1)
    expect(result.output).toContain("Check your connection")
    expect(result.installed).toBe(false)
  })
})
