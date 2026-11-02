import fs from "fs"
import path from "path"
import { Global } from "@dev-ai/core/global"
import { InstallationLocal } from "@dev-ai/core/installation/version"
import { UI } from "./ui"

// A DeV Code built from a git checkout updates from git, so upgrade prints those steps and changes
// nothing; release installs are replaced by `devcode upgrade` (cli/cmd/upgrade.ts).

/** The DeV checkout this binary was built from, if it can be found. */
export function checkout() {
  // <DeV>/packages/devcode/dist/<target>/bin/<binary>
  const root = path.resolve(fs.realpathSync(process.execPath), "../../../../../..")
  if (!fs.existsSync(path.join(root, "packages", "devcode", "package.json"))) return undefined
  return root
}

export function upgrade() {
  UI.println(UI.Style.TEXT_NORMAL_BOLD + "DeV Code updates from its git checkout:" + UI.Style.TEXT_NORMAL)
  UI.println(`  cd ${checkout() ?? "<your DeV checkout>"}`)
  UI.println("  git pull")
  UI.println("  bun install")
  UI.println("  cd packages/devcode")
  UI.println("  DEV_VERSION=1.19.4 bun run script/build.ts --single --skip-install --skip-embed-web-ui")
}

export function uninstall() {
  const bin =
    InstallationLocal || checkout()
      ? path.join(process.env.HOME ?? "~", ".local/bin")
      : path.dirname(fs.realpathSync(process.execPath))
  UI.println(UI.Style.TEXT_NORMAL_BOLD + "To remove DeV Code:" + UI.Style.TEXT_NORMAL)
  UI.println(`  rm ${path.join(bin, "devcode")}`)
  UI.println(`  rm -r ${Global.Path.data} ${Global.Path.config} ${Global.Path.cache} ${Global.Path.state}`)
  UI.println("The first line removes the commands; the second also deletes sessions, settings and keys.")
}

export * as SourceInstall from "./source-install"
