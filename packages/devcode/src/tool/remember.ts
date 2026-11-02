import { Effect, Schema } from "effect"
import { Global } from "@dev-ai/core/global"
import { InstanceState } from "@/effect/instance-state"
import { MemoryFiles } from "@/session/memory-files"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  note: Schema.optional(Schema.String).annotate({
    description: "One line to remember in future sessions of this project, written as a plain fact or rule",
  }),
  remove: Schema.optional(Schema.String).annotate({
    description: "Text of an earlier note that turned out to be wrong or outdated; every note containing it is removed",
  }),
})

export const RememberTool = Tool.define(
  "remember",
  Effect.succeed({
    description: [
      "Save a one-line note to this project's memory, which DeV reads at the start of every session.",
      "Save when the person corrects you, states a lasting preference (how they want code, tests, commits or answers),",
      "or when you learn something about the project that will help next time and is not obvious from the code.",
      "Do not save secrets, one-off task details, or anything already in DEV.md. Use remove to drop a note that is wrong.",
    ].join(" "),
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>) =>
      Effect.gen(function* () {
        if (!params.note?.trim() && !params.remove?.trim())
          return { title: "Nothing to remember", output: "Give a note to save or text to remove.", metadata: {} }
        const ctx = yield* InstanceState.context
        const file = MemoryFiles.autoFile(Global.Path.data, ctx.worktree === "/" ? ctx.directory : ctx.worktree)
        const result = MemoryFiles.remember(file, params)
        return {
          title: params.note ? `Remembered: ${params.note.slice(0, 60)}` : `Forgot notes about: ${params.remove}`,
          output: `${params.note ? "Saved." : ""}${result.removed ? ` Removed ${result.removed} note(s).` : ""} ${result.saved} note(s) in memory.`.trim(),
          metadata: {},
        }
      }),
  }),
)
