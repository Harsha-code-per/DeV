import { run as runTui, type TuiInput } from "@dev-ai/tui"
import { Global } from "@dev-ai/core/global"
import { AppNodeBuilder } from "@dev-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
