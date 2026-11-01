import { registerCustomTheme } from "@pierre/diffs"
import { DevCodeTheme } from "./marked-theme"

let registered = false

export function registerDevCodeTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("DeV", () => Promise.resolve(DevCodeTheme))
}
