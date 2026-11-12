import fs from "fs"
import path from "path"
import { Global } from "@dev-ai/core/global"

// What DeV keeps on this computer, folder by folder, and what removes it. Nothing here is uploaded.
export const StorageCommand = {
  command: "storage",
  describe: "show what DeV keeps on disk and how to free space",
  handler: () => {
    const rows: [string, string, string][] = [
      ["Sessions", Global.Path.data, "your conversation history (the .db files); delete sessions with /sessions"],
      ["Plugins", path.join(Global.Path.data, "plugins"), "plugins you installed; remove with /plugins"],
      ["Voice model", path.join(Global.Path.cache, "voice"), "only after /voice; safe to delete, downloads again when used"],
      ["Plugin and server downloads", path.join(Global.Path.cache, "packages"), "safe to delete, downloads again when used"],
      ["Pages (artifacts)", path.join(Global.Path.data, "artifacts"), "removed automatically after 30 days"],
      ["Memory", path.join(Global.Path.data, "memory"), "what DeV learnt about your projects; edit with /memory"],
      ["Undo snapshots", path.join(Global.Path.data, "snapshot"), "pruned automatically after 7 days"],
      ["Long tool output", path.join(Global.Path.data, "tool-output"), "removed automatically after 7 days"],
      ["Logs", Global.Path.log, "kept small automatically"],
    ]
    // The session database lives in the data folder next to the others, so only its own files count for it.
    const sessions = fs
      .readdirSync(Global.Path.data, { withFileTypes: true })
      .filter((item) => item.isFile() && /\.db(-wal|-shm)?$/.test(item.name))
      .reduce((sum, item) => sum + fs.statSync(path.join(Global.Path.data, item.name)).size, 0)
    const sizes = rows.map(([name, dir]) => (name === "Sessions" ? sessions : size(dir)))
    const width = Math.max(...rows.map(([name]) => name.length))
    for (const [i, [name, dir, note]] of rows.entries())
      console.log(`${name.padEnd(width)}  ${human(sizes[i]!).padStart(8)}  ${note}${sizes[i] ? `\n${" ".repeat(width + 12)}${dir}` : ""}`)
    console.log(`${"Total".padEnd(width)}  ${human(sizes.reduce((a, b) => a + b, 0)).padStart(8)}`)
  },
}

function size(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, item) => {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) return sum + size(file)
    return sum + (item.isFile() ? fs.statSync(file).size : 0)
  }, 0)
}

function human(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
