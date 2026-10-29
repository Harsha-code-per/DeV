import { createStore } from "solid-js/store"
import { useArgs } from "./args"
import { createSimpleContext } from "./helper"

// Permission modes, as in Claude Code:
// - normal: ask before acting
// - edits:  approve file edits automatically, ask for everything else
// - auto:   approve every request (only reachable after --auto/--yolo/--dangerously-skip-permissions
//           or an explicit opt-in, so a stray Shift+Tab can't switch it on)
// Explicitly denied actions never reach the user, so no mode can override a deny rule.
export type PermissionMode = "normal" | "edits" | "auto"

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const [store, setStore] = createStore<{ mode: PermissionMode; autoUnlocked: boolean; planFrom?: string }>({
      mode: args.auto ? "auto" : args.acceptEdits ? "edits" : "normal",
      autoUnlocked: Boolean(args.auto),
    })
    return {
      get mode() {
        return store.mode
      },
      /** Whether auto mode is part of the Shift+Tab cycle. */
      get autoUnlocked() {
        return store.autoUnlocked
      },
      /** Agent to return to when leaving plan mode. */
      get planFrom() {
        return store.planFrom
      },
      set(mode: PermissionMode) {
        if (mode === "auto") setStore("autoUnlocked", true)
        setStore("mode", mode)
      },
      setPlanFrom(agent: string | undefined) {
        setStore("planFrom", agent)
      },
      toggle() {
        this.set(store.mode === "auto" ? "normal" : "auto")
      },
      /** Whether a permission request is answered without asking in the current mode. */
      approves(permission: string) {
        if (store.mode === "auto") return true
        return store.mode === "edits" && permission === "edit"
      },
    }
  },
})
