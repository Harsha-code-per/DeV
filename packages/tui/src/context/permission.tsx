import { createStore } from "solid-js/store"
import { useArgs } from "./args"
import { createSimpleContext } from "./helper"
import type { PermissionRequest } from "@dev-ai/sdk/v2"
import { requestRisk } from "@dev-ai/core/command-risk"

// Permission modes, as in Claude Code (Shift+Tab cycles them, with plan between edits and auto):
// - normal: "Manual", ask before acting
// - edits:  approve file edits automatically, ask for everything else
// - auto:   never ask. Risky requests and actions the person ruled out in chat (see core command-risk.ts) are
//           refused and DeV is told why, so it finds a safer way. If DeV makes the same request again it really
//           needs it, so the person is asked; likewise after 3 refusals in a row or 20 in a session.
// - goal:   auto, plus the next message becomes the session's /goal: DeV works until it is verified met.
// Explicitly denied actions never reach the user, so no mode can override a deny rule.
export type PermissionMode = "normal" | "edits" | "auto" | "goal"

// The same fallback thresholds as Claude Code's auto mode.
const IN_A_ROW = 3
const IN_TOTAL = 20

export type Decision = { reply: "once" } | { reply: "reject"; message: string } | undefined

/** A request auto mode refused; /permissions offers to allow it from now on. */
export type Refusal = Pick<PermissionRequest, "sessionID" | "permission" | "patterns" | "always"> & { risk: string }

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const [store, setStore] = createStore<{ mode: PermissionMode; planFrom?: string; refused: Refusal[] }>({
      mode: args.goal ? "goal" : args.auto ? "auto" : args.acceptEdits ? "edits" : "normal",
      refused: [],
    })
    // Refusals per session: in a row (an approval resets it) and in total (reset when it triggers).
    const blocked = new Map<string, { row: number; total: number }>()
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
      /** What auto mode refused this run, newest first. */
      get refused() {
        return store.refused
      },
      forget(refusal: Refusal) {
        setStore("refused", (list) => list.filter((item) => refusalKey(item) !== refusalKey(refusal)))
      },
      /** How the current mode answers a permission request; undefined means ask the person. */
      decide(
        request: Pick<PermissionRequest, "sessionID" | "permission" | "patterns" | "always" | "metadata">,
      ): Decision {
        if (store.mode === "edits") return request.permission === "edit" ? { reply: "once" } : undefined
        if (store.mode !== "auto" && store.mode !== "goal") return undefined
        const risk = requestRisk(request)
        const count = blocked.get(request.sessionID) ?? { row: 0, total: 0 }
        if (!risk) {
          blocked.set(request.sessionID, { row: 0, total: count.total })
          return { reply: "once" }
        }
        // A repeat of a refused request asks the person: their answer in the permission dialog is what lets it
        // run, which an answer to DeV's question tool can't do.
        const repeat = store.refused.some(
          (item) => item.sessionID === request.sessionID && refusalKey(item) === refusalKey(request),
        )
        if (repeat) return undefined
        if (count.row >= IN_A_ROW || count.total >= IN_TOTAL) {
          blocked.set(request.sessionID, { row: 0, total: count.total >= IN_TOTAL ? 0 : count.total })
          return undefined
        }
        blocked.set(request.sessionID, { row: count.row + 1, total: count.total + 1 })
        setStore("refused", (list) =>
          [
            {
              sessionID: request.sessionID,
              permission: request.permission,
              patterns: request.patterns,
              always: request.always,
              risk,
            },
            ...list.filter((item) => refusalKey(item) !== refusalKey(request)),
          ].slice(0, 20),
        )
        return {
          reply: "reject",
          message: `Auto mode blocked this because it ${risk}. Do the task a safer way. If it really needs this, make the same call again and the user will be asked to approve it.`,
        }
      },
    }
  },
})

function refusalKey(item: Pick<Refusal, "permission" | "patterns">) {
  return [item.permission, ...item.patterns].join("\n")
}
