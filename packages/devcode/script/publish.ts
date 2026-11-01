#!/usr/bin/env bun
// Publishes DeV Code's npm package: a small launcher that fetches the verified release on first run
// (script/npm-launcher.mjs). Run by .github/workflows/release.yml, which signs in to npm with trusted
// publishing, so no token is stored.
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@dev-ai/script"
import { fileURLToPath } from "url"

process.chdir(fileURLToPath(new URL("..", import.meta.url)))

const dir = "./dist/npm"
await $`rm -rf ${dir}`
await $`mkdir -p ${dir}/bin`
await $`cp ./script/npm-launcher.mjs ${dir}/bin/devcode.mjs`
await $`cp ../../LICENSE ${dir}/LICENSE`
await Bun.write(
  `${dir}/README.md`,
  "# DeV Code\n\nPro coding for everyone. See https://github.com/Harsha-code-per/DeV.\n",
)
await Bun.write(
  `${dir}/package.json`,
  JSON.stringify(
    {
      name: "@devcodeagent/cli",
      version: Script.version,
      description: "DeV Code, a coding agent for your terminal with the premium features included.",
      license: pkg.license,
      homepage: "https://github.com/Harsha-code-per/DeV",
      // Must match the repository the workflow runs in, or npm rejects trusted publishing.
      repository: { type: "git", url: "git+https://github.com/Harsha-code-per/DeV.git" },
      type: "module",
      bin: { devcode: "./bin/devcode.mjs", dev: "./bin/devcode.mjs" },
      engines: { node: ">=18" },
    },
    null,
    2,
  ),
)
await $`npm publish --access public --tag ${Script.channel}`.cwd(dir)
