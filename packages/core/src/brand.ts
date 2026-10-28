import path from "path"

// DeV naming for config files and project folders. DeV names come first; opencode's names stay
// readable so setups migrated from OpenCode keep working.

/** Config file base names, preferred first. */
export const CONFIG_NAMES = ["dev", "opencode"]

/** Project config folders, preferred first. */
export const CONFIG_DIRS = [".dev", ".opencode"]

/** Where DeV writes new project config. */
export const CONFIG_DIR = CONFIG_DIRS[0]

/** Name for newly written config files. */
export const CONFIG_NAME = CONFIG_NAMES[0]

/** Name advertised over mDNS. Not plain "dev.local", which collides with hosts named "dev". */
export const MDNS_DOMAIN = "dev-ai.local"

/**
 * npm package installed into config folders so local plugins get typings. Our own plugin SDK isn't
 * on npm yet (roadmap M0.4); until then this is OpenCode's published SDK, which has the same API.
 */
export const PLUGIN_SDK_PACKAGE = "@opencode-ai/plugin"

/** `name.json` and `name.jsonc` for every config name, preferred first. */
export function configFiles(dir: string) {
  return CONFIG_NAMES.flatMap((name) => [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)])
}

export function isConfigDir(dir: string) {
  return CONFIG_DIRS.includes(path.basename(dir))
}

export * as Brand from "./brand"
