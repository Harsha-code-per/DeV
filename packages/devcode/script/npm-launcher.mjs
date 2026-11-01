#!/usr/bin/env node
// The npm package holds only this launcher, so npm, pnpm, bun and yarn all work without an install
// script. On first run it downloads the matching release, verifies its checksum, and keeps it in
// ~/.devcode/npm/<version>. After that it just starts the program.
import childProcess from "child_process"
import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const { version } = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"))
const releases =
  process.env.DEVCODE_RELEASE_URL ?? `https://github.com/Harsha-code-per/DeV/releases/download/v${version}`

const platform = { darwin: "darwin", linux: "linux", win32: "windows" }[os.platform()]
const arch = { x64: "x64", arm64: "arm64" }[os.arch()]
if (!platform || !arch) fail(`DeV Code doesn't support ${os.platform()} ${os.arch()} yet.`)

const home = path.join(process.env.DEVCODE_HOME ?? path.join(os.homedir(), ".devcode"), "npm", version)
const binary = path.join(home, platform === "windows" ? "devcode.exe" : "devcode")

if (!fs.existsSync(binary)) await install()
run()

async function install() {
  const baseline = arch === "x64" && !supportsAvx2() ? "-baseline" : ""
  const musl = isMusl() ? "-musl" : ""
  const asset = `devcode-${platform}-${arch}${baseline}${musl}.${platform === "windows" ? "zip" : "tar.gz"}`
  console.error(`Downloading DeV Code ${version}, once only…`)
  const sums = Buffer.from(await download("SHA256SUMS")).toString("utf8")
  const expected = sums
    .split("\n")
    .find((line) => line.trim().endsWith(` ${asset}`))
    ?.split(/\s+/)[0]
  if (!expected) fail(`This release has no build named ${asset}.`)
  const archive = Buffer.from(await download(asset))
  const actual = crypto.createHash("sha256").update(archive).digest("hex")
  if (actual !== expected) fail(`The download of ${asset} failed its checksum, so it wasn't installed. Try again.`)

  // Unpacked beside the target and renamed, so two terminals starting at once can't see half a copy.
  fs.mkdirSync(path.dirname(home), { recursive: true })
  const staging = fs.mkdtempSync(`${home}.`)
  const file = path.join(staging, asset)
  fs.writeFileSync(file, archive)
  const flags = platform === "windows" ? "-xf" : "-xzf"
  const unpacked = childProcess.spawnSync("tar", [flags, file, "-C", staging], { stdio: "inherit", windowsHide: true })
  if (unpacked.status !== 0) fail("Couldn't unpack the download. Check that tar is installed.")
  fs.rmSync(file)
  fs.chmodSync(path.join(staging, path.basename(binary)), 0o755)
  try {
    fs.renameSync(staging, home)
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    if (!fs.existsSync(binary)) throw error
  }
}

async function download(name) {
  const response = await fetch(`${releases}/${name}`).catch((error) => {
    fail(`Couldn't download DeV Code: ${error.message}`)
  })
  if (!response.ok) fail(`Couldn't download ${name}: the server answered ${response.status}.`)
  return response.arrayBuffer()
}

function run() {
  const child = childProcess.spawn(binary, process.argv.slice(2), { stdio: "inherit", windowsHide: false })
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(signal, () => {
      child.kill(signal)
    })
  child.on("error", (error) => fail(error.message))
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })
}

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function supportsAvx2() {
  if (arch !== "x64") return false

  if (platform === "linux") {
    try {
      return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync("/proc/cpuinfo", "utf8"))
    } catch {
      return false
    }
  }

  if (platform === "darwin") {
    try {
      const result = childProcess.spawnSync("sysctl", ["-n", "hw.optional.avx2_0"], {
        encoding: "utf8",
        timeout: 1500,
      })
      if (result.status !== 0) return false
      return (result.stdout || "").trim() === "1"
    } catch {
      return false
    }
  }

  if (platform === "windows") {
    const command =
      '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)'

    for (const executable of ["powershell.exe", "pwsh.exe", "pwsh", "powershell"]) {
      try {
        const result = childProcess.spawnSync(executable, ["-NoProfile", "-NonInteractive", "-Command", command], {
          encoding: "utf8",
          timeout: 3000,
          windowsHide: true,
        })
        if (result.status !== 0) continue
        const output = (result.stdout || "").trim().toLowerCase()
        if (output === "true" || output === "1") return true
        if (output === "false" || output === "0") return false
      } catch {
        continue
      }
    }
  }

  return false
}

function isMusl() {
  if (platform !== "linux") return false

  try {
    if (fs.existsSync("/etc/alpine-release")) return true
  } catch {
    // Ignore filesystem probes that are blocked by the host.
  }

  try {
    const result = childProcess.spawnSync("ldd", ["--version"], { encoding: "utf8" })
    return `${result.stdout || ""}${result.stderr || ""}`.toLowerCase().includes("musl")
  } catch {
    return false
  }
}
