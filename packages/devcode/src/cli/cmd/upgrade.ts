import fs from "fs"
import path from "path"
import { $ } from "bun"
import { InstallationLocal, InstallationVersion } from "@dev-ai/core/installation/version"
import { errorMessage } from "@/util/error"
import { SourceInstall } from "../source-install"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { Installation } from "@/installation"

declare const DEV_LIBC: string | undefined

const headers = { "User-Agent": `devcode/${InstallationVersion}` }

export const UpgradeCommand = cmd({
  command: "upgrade [target]",
  describe: "update DeV Code to the latest release",
  builder: (yargs) =>
    yargs.positional("target", { type: "string", describe: "version to install instead of the latest, e.g. 1.2.3" }),
  handler: async (args) => {
    if (InstallationLocal || SourceInstall.checkout()) return SourceInstall.upgrade()
    const binary = fs.realpathSync(process.execPath)
    const manager = packageManager(binary, args.target ?? "latest")
    if (manager) return UI.println(`DeV Code was installed with a package manager. Update it with:\n  ${manager}`)
    await upgrade(binary, args.target).catch((error) => {
      UI.error(errorMessage(error))
      process.exitCode = 1
    })
  },
})

// github.com's release links, not the API: the API allows 60 requests an hour per address.
const releases = "https://github.com/Harsha-code-per/DeV/releases"

async function upgrade(binary: string, target: string | undefined) {
  const version = target?.replace(/^v/, "") ?? (await latestVersion())
  if (!target && version === InstallationVersion)
    return UI.println(`DeV Code ${version} is already the latest version.`)

  const name = assetName({
    platform: process.platform,
    arch: process.arch,
    musl: typeof DEV_LIBC !== "undefined" && DEV_LIBC === "musl",
    avx2: avx2(),
  })
  const base = `${releases}/download/v${version}`
  UI.println(`Downloading DeV Code ${version} (${name})`)
  // Work next to the binary so the final rename stays on one filesystem and is atomic.
  const dir = fs.mkdtempSync(path.join(path.dirname(binary), ".devcode-upgrade-"))
  try {
    const archive = path.join(dir, name)
    await download(`${base}/${name}`, archive)
    await verify(archive, await (await download(`${base}/SHA256SUMS`)).text(), name)
    const files = path.join(dir, "files")
    fs.mkdirSync(files)
    // tar reads both .tar.gz and, on Windows (bsdtar), .zip.
    await $`tar -xf ${archive} -C ${files}`.quiet()
    const exe = process.platform === "win32" ? "devcode.exe" : "devcode"
    // Files that ship beside the binary (such as vendor/) first, then the binary itself.
    fs.readdirSync(files)
      .filter((file) => file !== exe)
      .forEach((file) =>
        fs.cpSync(path.join(files, file), path.join(path.dirname(binary), file), { recursive: true, force: true }),
      )
    replace(binary, path.join(files, exe))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  UI.println(`Updated DeV Code ${InstallationVersion} → ${version}`)
}

// The "latest" link redirects to the newest release's tag.
async function latestVersion() {
  const response = await fetch(`${releases}/latest`, { headers, redirect: "manual" })
  const tag = response.headers.get("location")?.match(/\/releases\/tag\/v?([^/?#]+)$/)?.[1]
  if (!tag) throw new Error(`Couldn't find the latest DeV Code release (GitHub answered ${response.status}).`)
  return tag
}

async function download(url: string, file?: string) {
  const response = await fetch(url, { headers: { "User-Agent": headers["User-Agent"] } })
  if (response.status === 404) throw new Error(`Not found on GitHub: ${url}. Check the version number.`)
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText} (${url})`)
  if (file) await Bun.write(file, response)
  return response
}

function packageManager(binary: string, version: string) {
  if (binary.startsWith("/usr/lib/devcode/")) return Installation.systemUpdate()
  const parts = binary.split(path.sep)
  if (parts.includes("node_modules") || parts.includes("npm")) return `npm install -g @devcodeagent/cli@${version}`
  if (parts.includes("Cellar")) return "brew upgrade devcode"
  if (parts.includes("scoop")) return version === "latest" ? "scoop update devcode" : `scoop install devcode@${version}`
}

// x64 CPUs without AVX2 need the baseline build.
function avx2() {
  if (process.arch !== "x64") return true
  if (process.platform === "linux") return /\bavx2\b/.test(fs.readFileSync("/proc/cpuinfo", "utf8"))
  if (process.platform === "darwin")
    return Bun.spawnSync(["sysctl", "-n", "hw.optional.avx2_0"]).stdout.toString().trim() === "1"
  return true
}

/** The release archive for a machine, named like the dist folders packages/devcode/script/build.ts writes. */
export function assetName(input: { platform: string; arch: string; musl: boolean; avx2: boolean }) {
  const os = input.platform === "win32" ? "windows" : input.platform
  const name = [
    "devcode",
    os,
    input.arch,
    input.arch === "x64" && !input.avx2 ? "baseline" : undefined,
    os === "linux" && input.musl ? "musl" : undefined,
  ]
    .filter(Boolean)
    .join("-")
  return os === "windows" ? `${name}.zip` : `${name}.tar.gz`
}

/** The SHA-256 SHA256SUMS lists for a file (sha256sum format, text or binary mode). */
export function checksum(sums: string, file: string) {
  return sums
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1]?.replace(/^\*/, "") === file)?.[0]
    ?.toLowerCase()
}

export async function verify(file: string, sums: string, name: string) {
  const expected = checksum(sums, name)
  if (!expected) throw new Error(`SHA256SUMS has no entry for ${name}`)
  const actual = new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex")
  if (actual !== expected) throw new Error(`Checksum mismatch for ${name}: expected ${expected}, got ${actual}`)
}

/** Atomically swaps `source` in for `target`; both must be on the same filesystem. */
export function replace(target: string, source: string) {
  fs.chmodSync(source, 0o755)
  // Windows can't overwrite a running .exe but can rename it, so move it aside (the next upgrade deletes it).
  if (process.platform === "win32") {
    fs.rmSync(`${target}.old`, { force: true })
    fs.renameSync(target, `${target}.old`)
  }
  fs.renameSync(source, target)
}
