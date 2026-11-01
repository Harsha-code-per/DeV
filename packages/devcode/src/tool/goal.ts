import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { SessionGoal } from "../session/goal"
import DESCRIPTION from "./goal-set.txt"

export const Parameters = Schema.Struct({
  objective: Schema.String.annotate({ description: "What must be true for the goal to be met" }),
})

export const GoalSetTool = Tool.define(
  "goal_set",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.sync(() => {
        SessionGoal.apply(ctx.sessionID, { action: "set", objective: params.objective })
        return {
          title: `Goal: ${params.objective}`,
          output: `Goal set. Keep working until it is met. ${SessionGoal.kickoff(params.objective)}`,
          metadata: {},
        }
      }),
  }),
)
