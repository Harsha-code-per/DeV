// Builds the unpacked extension into dist/: load it from chrome://extensions with "Load unpacked".
import { cp, rm } from "fs/promises"

const dist = new URL("./dist/", import.meta.url).pathname
await rm(dist, { recursive: true, force: true })
const result = await Bun.build({
  entrypoints: ["src/sidepanel.ts", "src/background.ts"],
  outdir: dist,
  target: "browser",
})
if (!result.success) throw new AggregateError(result.logs, "build failed")
await cp("manifest.json", `${dist}/manifest.json`)
await cp("src/sidepanel.html", `${dist}/sidepanel.html`)
await cp("icons", `${dist}/icons`, { recursive: true })
console.log(`Built ${dist}`)
