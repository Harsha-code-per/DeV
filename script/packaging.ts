#!/usr/bin/env bun
// Release assets from packages/devcode/dist (script/build.ts): one archive per target, SHA256SUMS,
// and the Homebrew formula, Scoop manifest and AUR PKGBUILD filled in from packaging/. Output: dist/release.
// Usage: bun script/packaging.ts <version>
import { $ } from "bun"
import { readdir } from "fs/promises"
import path from "path"

const version = process.argv[2]?.replace(/^v/, "")
if (!version) throw new Error("usage: bun script/packaging.ts <version>")
const root = path.resolve(import.meta.dir, "..")
const dist = path.join(root, "packages/devcode/dist")
const out = path.join(root, "dist/release")
await $`rm -rf ${out}`
await $`mkdir -p ${out}`

const targets = (await Array.fromAsync(new Bun.Glob("devcode-*/bin").scan({ cwd: dist, onlyFiles: false }))).map(
  (bin) => path.dirname(bin),
)
for (const name of targets.sort()) {
  const bin = path.join(dist, name, "bin")
  if (name.includes("-windows-")) {
    await $`zip -qr ${path.join(out, `${name}.zip`)} .`.cwd(bin)
    continue
  }
  await $`chmod 755 devcode`.cwd(bin)
  await $`tar -czf ${path.join(out, `${name}.tar.gz`)} .`.cwd(bin)
}

const sums = new Map(
  await Promise.all(
    (await readdir(out)).sort().map(async (file) => {
      const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(out, file)).arrayBuffer())
      return [file, hash.digest("hex")] as const
    }),
  ),
)
await Bun.write(path.join(out, "SHA256SUMS"), [...sums].map(([file, hash]) => `${hash}  ${file}\n`).join(""))

for (const template of ["homebrew/devcode.rb", "scoop/devcode.json", "aur/PKGBUILD"]) {
  const text = (await Bun.file(path.join(root, "packaging", template)).text())
    .replaceAll("@VERSION@", version)
    .replace(/@SHA256:([^@]+)@/g, (_, file: string) => {
      const hash = sums.get(file)
      if (!hash) throw new Error(`${template}: no release asset named ${file}`)
      return hash
    })
  await Bun.write(path.join(out, path.basename(template)), text)
}
console.log(`release assets in ${out}:\n${(await readdir(out)).join("\n")}`)
