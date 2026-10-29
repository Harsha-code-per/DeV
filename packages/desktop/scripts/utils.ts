import { $ } from "bun"
import { chmod, copyFile } from "node:fs/promises"

export type Channel = "dev" | "beta" | "prod"

export function resolveChannel(): Channel {
  const raw = Bun.env.DEV_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
}

// Rust-style target triples (RUST_TARGET) mapped to DeV Code's build output in packages/devcode/dist.
export const CLI_BINARIES = [
  { rustTarget: "aarch64-apple-darwin", dist: "devcode-darwin-arm64" },
  { rustTarget: "x86_64-apple-darwin", dist: "devcode-darwin-x64" },
  { rustTarget: "aarch64-pc-windows-msvc", dist: "devcode-windows-arm64" },
  { rustTarget: "x86_64-pc-windows-msvc", dist: "devcode-windows-x64" },
  { rustTarget: "x86_64-unknown-linux-gnu", dist: "devcode-linux-x64" },
  { rustTarget: "aarch64-unknown-linux-gnu", dist: "devcode-linux-arm64" },
]

export const RUST_TARGET = Bun.env.RUST_TARGET

function nativeTarget() {
  const { platform, arch } = process
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc"
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu"
  throw new Error(`Unsupported platform: ${platform}/${arch}`)
}

export function getCurrentCli(target = RUST_TARGET ?? nativeTarget()) {
  const binaryConfig = CLI_BINARIES.find((item) => item.rustTarget === target)
  if (!binaryConfig) throw new Error(`CLI configuration not available for target '${target}'`)

  return binaryConfig
}

export async function copyCliToResources() {
  const cli = getCurrentCli()
  const source = windowsify(`../devcode/dist/${cli.dist}/bin/devcode`)
  const dest = windowsify("resources/devcode")
  if (!(await Bun.file(source).exists())) {
    console.warn(`DeV Code binary not found at ${source}; build it with \`bun run build --single\` in packages/devcode`)
    return
  }
  await copyFile(source, dest)
  if (process.platform !== "win32") await chmod(dest, 0o755)
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }
  if (process.platform === "darwin") await $`codesign --force --sign - ${dest}`

  console.log(`Copied ${source} to ${dest}`)
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
