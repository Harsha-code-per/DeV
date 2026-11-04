import { createStore } from "solid-js/store"
import { useArgs } from "./args"
import { createSimpleContext } from "./helper"
import type { PermissionRequest } from "@dev-ai/sdk/v2"
import { riskOf } from "./auto-risk"

// Permission modes, as in Claude Code (Shift+Tab cycles them, with plan between edits and auto):
// - normal: ask before acting
// - edits:  approve file edits automatically, ask for everything else
// - auto:   never ask. Risky requests (see auto-risk.ts) are refused and DeV is told why, so it finds a
//           safer way; after BLOCK_LIMIT refusals in a row it asks the person instead of looping.
// - goal:   auto, plus the next message becomes the session's /goal: DeV works until it is verified met.
// Explicitly denied actions never reach the user, so no mode can override a deny rule.
export type PermissionMode = "normal" | "edits" | "auto" | "goal"

const BLOCK_LIMIT = 3

export type Decision = { reply: "once" } | { reply: "reject"; message: string } | undefined

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const [store, setStore] = createStore<{ mode: PermissionMode; planFrom?: string }>({
      mode: args.goal ? "goal" : args.auto ? "auto" : args.acceptEdits ? "edits" : "normal",
    })
    // Refusals in a row per session; any approval resets it.
    const blocked = new Map<string, number>()
    return {
      get mode() {
        return store.mode
      },
      /** Agent to return to when leaving plan mode. */
      get planFrom() {
        return store.planFrom
      },
      set(mode: PermissionMode) {
        setStore("mode", mode)
      },
      setPlanFrom(agent: string | undefined) {
        setStore("planFrom", agent)
      },
      /** How the current mode answers a permission request; undefined means ask the person. */
      decide(request: Pick<PermissionRequest, "sessionID" | "permission" | "patterns" | "metadata">): Decision {
        if (store.mode === "edits") return request.permission === "edit" ? { reply: "once" } : undefined
        if (store.mode !== "auto" && store.mode !== "goal") return undefined
        const risk = riskOf(request)
        if (!risk) {
          blocked.delete(request.sessionID)
          return { reply: "once" }
        }
        const count = (blocked.get(request.sessionID) ?? 0) + 1
        if (count > BLOCK_LIMIT) {
          blocked.delete(request.sessionID)
          return undefined
        }
        blocked.set(request.sessionID, count)
        return {
          reply: "reject",
          message: `Auto mode blocked this because it ${risk}. Do the task a safer way. If it really needs this, ask the user with the question tool.`,
        }
      },
    }
  },
})
