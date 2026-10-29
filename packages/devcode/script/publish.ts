#!/usr/bin/env bun
// Publishes the binaries script/build.ts left in dist/ to npm: one package per target
// ("devcode-linux-x64", ...) and the "devcode" wrapper, whose postinstall links the right one.
// Run by .github/workflows/release.yml with npm already logged in.
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@dev-ai/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

// npm provenance only verifies when package.json names the repository the workflow ran in.
const repository = { type: "git", url: "git+https://github.com/Harsha-code-per/DeV.git" }

async function publish(dir: string, name: string, version: string) {
  // GitHub artifact downloads can drop the executable bit.
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if ((await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0) {
    console.log(`already published ${name}@${version}`)
    return
  }
  const manifest = await Bun.file(`${dir}/package.json`).json()
  await Bun.file(`${dir}/package.json`).write(
    JSON.stringify({ ...manifest, license: pkg.license, repository }, null, 2),
  )
  await $`bun pm pack`.cwd(dir)
  await $`npm publish *.tgz --access public --provenance --tag ${Script.channel}`.cwd(dir)
}

const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
  const manifest = await Bun.file(`./dist/${filepath}`).json()
  if (manifest.name !== pkg.name) binaries[manifest.name] = manifest.version
}
console.log("binaries", binaries)
const version = Object.values(binaries)[0]

await $`mkdir -p ./dist/${pkg.name}/bin`
await $`cp ./script/postinstall.mjs ./dist/${pkg.name}/postinstall.mjs`
await Bun.file(`./dist/${pkg.name}/LICENSE`).write(await Bun.file("../../LICENSE").text())
await Bun.file(`./dist/${pkg.name}/bin/${pkg.name}.exe`).write(
  [
    `echo "Error: ${pkg.name}'s postinstall script was not run." >&2`,
    'echo "" >&2',
    'echo "This occurs when using --ignore-scripts during installation, or when using a" >&2',
    'echo "package manager like pnpm that does not run postinstall scripts by default." >&2',
    'echo "" >&2',
    'echo "To fix this, run the postinstall script manually:" >&2',
    `echo "  cd node_modules/${pkg.name} && node postinstall.mjs" >&2`,
    "exit 1",
    "",
  ].join("\n"),
)

await Bun.file(`./dist/${pkg.name}/package.json`).write(
  JSON.stringify(
    {
      name: pkg.name,
      bin: {
        devcode: `./bin/${pkg.name}.exe`,
        dev: `./bin/${pkg.name}.exe`,
      },
      scripts: {
        postinstall: "node ./postinstall.mjs",
      },
      version,
      os: ["darwin", "linux", "win32"],
      cpu: ["arm64", "x64"],
      optionalDependencies: binaries,
    },
    null,
    2,
  ),
)

for (const [name, version] of Object.entries(binaries)) await publish(`./dist/${name}`, name, version)
await publish(`./dist/${pkg.name}`, pkg.name, version)
