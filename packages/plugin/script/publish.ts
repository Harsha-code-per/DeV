#!/usr/bin/env bun
import { Script } from "@dev-ai/script"
import { $ } from "bun"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

await $`bun tsc`
const originalText = await Bun.file("package.json").text()
const pkg = JSON.parse(originalText) as {
  name: string
  version: string
  exports: Record<string, string>
  dependencies: Record<string, string>
  repository?: unknown
}
// Published under DeV's npm organisation at DeV's version, next to @devcodeagent/sdk.
// `--pack` builds the tarball without publishing.
const pack = process.argv.includes("--pack")
pkg.name = "@devcodeagent/plugin"
pkg.version = Script.version
// npm's provenance check requires the repository the publishing workflow runs in.
pkg.repository = { type: "git", url: "git+https://github.com/Harsha-code-per/DeV.git", directory: "packages/plugin" }
delete pkg.dependencies["@dev-ai/sdk"]
pkg.dependencies["@devcodeagent/sdk"] = Script.version
for (const file of new Bun.Glob("dist/**/*.{js,d.ts}").scanSync()) {
  const text = await Bun.file(file).text()
  await Bun.write(file, text.replaceAll("@dev-ai/sdk", "@devcodeagent/sdk").replaceAll("@dev-ai/plugin", "@devcodeagent/plugin"))
}
if (!pack && (await published(pkg.name, pkg.version))) {
  console.log(`already published ${pkg.name}@${pkg.version}`)
} else {
  for (const [key, value] of Object.entries(pkg.exports)) {
    const file = value.replace("./src/", "./dist/").replace(".ts", "")
    // @ts-ignore
    pkg.exports[key] = {
      import: file + ".js",
      types: file + ".d.ts",
    }
  }
  await Bun.write("package.json", JSON.stringify(pkg, null, 2))
  try {
    await $`bun pm pack`
    if (!pack) await $`npm publish *.tgz --tag ${Script.channel} --access public`
  } finally {
    await Bun.write("package.json", originalText)
  }
}
