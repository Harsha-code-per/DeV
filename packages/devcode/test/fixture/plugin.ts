import { mkdir } from "fs/promises"
import path from "path"
import { Brand } from "@dev-ai/core/brand"

// Marks the plugin SDK as already installed so config loading never reaches the network.
export async function markPluginDependenciesReady(dir: string) {
  await mkdir(path.join(dir, "node_modules"), { recursive: true })
  await Bun.write(
    path.join(dir, "package-lock.json"),
    JSON.stringify({ packages: { "": { dependencies: { [Brand.PLUGIN_SDK_PACKAGE]: "0.0.0" } } } }),
  )
}
