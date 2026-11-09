export * as ConfigHooksV1 from "./hooks"

import { Schema } from "effect"

// The common hooks setting shape, so existing hook configs carry over.
export const Command = Schema.Struct({
  type: Schema.Literal("command"),
  command: Schema.String,
  timeout: Schema.optional(Schema.Number).annotate({ description: "Seconds before the hook is stopped (default 60)" }),
})

export const Http = Schema.Struct({
  type: Schema.Literal("http"),
  url: Schema.String.annotate({ description: "Receives the event as a JSON POST" }),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  timeout: Schema.optional(Schema.Number).annotate({ description: "Seconds before the request is cancelled (default 60)" }),
})

const Judge = {
  prompt: Schema.String.annotate({
    description: "What the model checks. $ARGUMENTS is replaced by the event JSON (appended when absent). It answers {\"ok\": true} or {\"ok\": false, \"reason\": …}",
  }),
  model: Schema.optional(Schema.String).annotate({ description: "provider/model to use; defaults to the session's model" }),
}

export const Prompt = Schema.Struct({
  type: Schema.Literal("prompt"),
  ...Judge,
  timeout: Schema.optional(Schema.Number).annotate({ description: "Seconds before the check is abandoned (default 30)" }),
})

export const Agent = Schema.Struct({
  type: Schema.Literal("agent"),
  ...Judge,
  timeout: Schema.optional(Schema.Number).annotate({ description: "Seconds before the check is abandoned (default 60)" }),
})

export const Matcher = Schema.Struct({
  matcher: Schema.optional(Schema.String).annotate({
    description: "Regular expression matched against the tool name (case-insensitive); omit to match every tool",
  }),
  hooks: Schema.mutable(Schema.Array(Schema.Union([Command, Http, Prompt, Agent]))),
})

const List = Schema.optional(Schema.mutable(Schema.Array(Matcher)))

export const Info = Schema.Struct({
  PreToolUse: List,
  PostToolUse: List,
  UserPromptSubmit: List,
  Stop: List,
  SessionStart: List,
  SessionEnd: List,
  Notification: List,
  SubagentStop: List,
  PostToolUseFailure: List,
  PreCompact: List,
  PostCompact: List,
  FileChanged: List,
  PermissionRequest: List,
  SubagentStart: List,
})
export type Info = Schema.Schema.Type<typeof Info>
export type Event = keyof Info
