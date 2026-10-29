import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { assetName, checksum, replace, verify } from "../../../src/cli/cmd/upgrade"
import { tmpdir } from "../../fixture/fixture"

// sha256 of "new devcode\n"
const hash = "95af63b1568dd72a9c7f6fef3c770301bd3b2fd25b8c905eb90acff5a4eb9feb"

describe("devcode upgrade", () => {
  test("picks the archive build.ts names for each platform", () => {
    const pick = (platform: string, arch: string, musl = false, avx2 = true) =>
      assetName({ platform, arch, musl, avx2 })
    expect(pick("linux", "x64")).toBe("devcode-linux-x64.tar.gz")
    expect(pick("linux", "arm64", true)).toBe("devcode-linux-arm64-musl.tar.gz")
    expect(pick("linux", "x64", true, false)).toBe("devcode-linux-x64-baseline-musl.tar.gz")
    expect(pick("darwin", "arm64", false, false)).toBe("devcode-darwin-arm64.tar.gz")
    expect(pick("darwin", "x64", false, false)).toBe("devcode-darwin-x64-baseline.tar.gz")
    expect(pick("win32", "x64")).toBe("devcode-windows-x64.zip")
    expect(pick("win32", "x64", true)).toBe("devcode-windows-x64.zip")
  })

  test("reads sha256sum output in text and binary mode", () => {
    const sums = `${"a".repeat(64)}  devcode-linux-x64.tar.gz\r\n${hash.toUpperCase()} *devcode-windows-x64.zip\n`
    expect(checksum(sums, "devcode-linux-x64.tar.gz")).toBe("a".repeat(64))
    expect(checksum(sums, "devcode-windows-x64.zip")).toBe(hash)
    expect(checksum(sums, "devcode-linux-x64")).toBeUndefined()
  })

  test("verifies a downloaded file against SHA256SUMS", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "devcode-linux-x64.tar.gz")
    await Bun.write(file, "new devcode\n")
    await verify(file, `${hash}  devcode-linux-x64.tar.gz\n`, "devcode-linux-x64.tar.gz")

    await expect(verify(file, `${hash}  other.tar.gz\n`, "devcode-linux-x64.tar.gz")).rejects.toThrow(
      "SHA256SUMS has no entry for devcode-linux-x64.tar.gz",
    )
    await Bun.write(file, "tampered\n")
    await expect(verify(file, `${hash}  devcode-linux-x64.tar.gz\n`, "devcode-linux-x64.tar.gz")).rejects.toThrow(
      "Checksum mismatch",
    )
  })

  test("swaps the new binary in place of the old one", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "devcode")
    const source = path.join(tmp.path, ".devcode-upgrade-x", "devcode")
    await Bun.write(target, "old devcode\n")
    await Bun.write(source, "new devcode\n")
    replace(target, source)
    expect(await Bun.file(target).text()).toBe("new devcode\n")
    expect(await Bun.file(source).exists()).toBe(false)
    if (process.platform !== "win32") expect((await fs.stat(target)).mode & 0o777).toBe(0o755)
  })
})
