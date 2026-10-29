import { $ } from "bun"
import { copyCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.DEV_CHANNEL ?? "dev"}`

await $`cd ../devcode && bun script/build-node.ts`
await copyCliToResources()
