import { Effect, Schema, Scope } from "effect"
import { Session } from "@/session/session"
import { SessionID } from "../session/schema"
import type { TaskPromptOps } from "./task"
import * as Tool from "./tool"
import DESCRIPTION from "./message.txt"

// Messages between the agents of one conversation: the lead and its subagents, forks and background tasks.
// Delivery adds the message to the other session, which reads it at its next step; the sender never waits, so a
// subagent can message the lead that is waiting for it. Off with "permission": { "message": "deny" }.

export const Parameters = Schema.Struct({
  to: Schema.String.annotate({
    description: 'Who gets it: "lead" for the main conversation, or the task_id of a subagent, fork or background task',
  }),
  text: Schema.String.annotate({
    description: "The message: what changed, what you need, or what they should do. Be specific",
  }),
})

// Two agents replying to each other could otherwise go on forever.
const MAX_PER_SESSION = 20
const sent = new Map<string, number>()
const STATUS_CHECK = /\b(status|progress|done yet|finished yet|are you done|is it done|how is it going|still running)\b/i

export const MessageTool = Tool.define(
  "message",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const scope = yield* Scope.Scope

    const root = Effect.fnUntraced(function* (id: SessionID) {
      const first = yield* sessions.get(id)
      const walk = { session: first }
      while (walk.session.parentID) walk.session = yield* sessions.get(walk.session.parentID)
      return walk.session
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const notSent = (output: string) => ({ title: "Message not sent", output, metadata: {} })
          const ops = ctx.extra?.promptOps as TaskPromptOps | undefined
          if (!ops) return notSent("Messages can't be sent from here.")
          const count = sent.get(ctx.sessionID) ?? 0
          if (count >= MAX_PER_SESSION)
            return notSent(`You've sent ${MAX_PER_SESSION} messages, the most one agent may send. Finish your work instead.`)

          const home = yield* root(ctx.sessionID)
          const target =
            params.to.trim().toLowerCase() === "lead"
              ? home
              : yield* sessions.get(SessionID.make(params.to.trim())).pipe(Effect.catchCause(() => Effect.void))
          const sameConversation = target ? (yield* root(target.id)).id === home.id : false
          if (!target || !sameConversation)
            return notSent(`No agent "${params.to}" in this conversation. Use "lead", or a task_id from a task result.`)
          if (target.id === ctx.sessionID) return notSent("That is you. Send it to the lead or another task.")

          // Free models tend to poll background tasks, which only spends requests: the result arrives on its own.
          if (target.parentID && STATUS_CHECK.test(params.text))
            return notSent("No need to ask: you're told automatically when it finishes. Carry on, or end your turn.")

          const from = yield* sessions.get(ctx.sessionID)
          const sender = from.parentID ? `${from.title} (task_id ${from.id})` : "the lead"
          sent.set(ctx.sessionID, count + 1)
          yield* ops
            .prompt({
              sessionID: target.id,
              agent: target.agent ?? ctx.agent,
              parts: [{ type: "text", synthetic: true, text: `<message from="${sender}">\n${params.text}\n</message>` }],
            })
            .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
          return {
            title: `Message to ${target.id === home.id ? "the lead" : target.title}`,
            output: "Sent. It arrives at their next step; carry on with your work.",
            metadata: { to: target.id },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
