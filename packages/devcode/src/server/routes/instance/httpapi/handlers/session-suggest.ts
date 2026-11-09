import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { SessionV1 } from "@dev-ai/core/v1/session"
import { LLMEvent } from "@dev-ai/llm"
import { Effect, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

const SUGGEST_AGENT: Agent.Info = {
  name: "prompt-suggestion",
  mode: "primary",
  permission: [],
  options: {},
  native: true,
  prompt: "",
}

// Enough of the exchange to guess the next step, small enough for a free tier's per-minute limit.
const MAX_CHARS = 3000

export const sessionSuggestHandlers = HttpApiBuilder.group(InstanceHttpApi, "sessionSuggest", (handlers) =>
  Effect.gen(function* () {
    const llm = yield* LLM.Service
    const provider = yield* Provider.Service
    const sessions = yield* Session.Service

    const suggest = Effect.fn("SessionSuggestHttpApi.suggest")(function* (sessionID: SessionID) {
      const recent = (yield* sessions.messages({ sessionID, limit: 20 })).toSorted(
        (a, b) => a.info.time.created - b.info.time.created,
      )
      const user = recent.findLast((m) => m.info.role === "user")
      if (!user || user.info.role !== "user") return
      const reply = recent.findLast((m) => m.info.role === "assistant" && m.info.time.created >= user.info.time.created)
      if (!reply || reply.info.role !== "assistant" || reply.info.error) return
      const asked = text(user)
      const answered = text(reply)
      if (!asked || !answered) return
      const model =
        (yield* provider.getSmallModel(user.info.model.providerID)) ??
        (yield* provider.getModel(user.info.model.providerID, user.info.model.modelID))
      const output = yield* llm
        .stream({
          agent: SUGGEST_AGENT,
          user: user.info,
          system: [],
          small: true,
          tools: {},
          model,
          sessionID,
          retries: 1,
          messages: [
            {
              role: "user",
              content: [
                "A developer is working with a coding assistant. Here is their last request and the assistant's reply.",
                `<request>\n${asked.slice(-MAX_CHARS)}\n</request>`,
                `<reply>\n${answered.slice(-MAX_CHARS)}\n</reply>`,
                "Write the developer's most likely next message, in their voice, as a short instruction of at most 12 words (for example: run the tests, commit this, now add the same check to the API).",
                "If the reply asked them a question, answer it the way they most likely would. If there is no obvious next step, write NONE. Reply with the message only.",
              ].join("\n\n"),
            },
          ],
        })
        .pipe(
          Stream.filter(LLMEvent.is.textDelta),
          Stream.map((event) => event.text),
          Stream.mkString,
        )
      const line = output
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .split("\n")
        .map((item) => item.trim().replace(/^["'`]+|["'`]+$/g, ""))
        .find(Boolean)
      if (!line || /^none\.?$/i.test(line) || line.length > 120) return
      return line
    })

    return handlers.handle("suggest", (ctx) =>
      suggest(ctx.params.sessionID).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("prompt suggestion failed", { sessionID: ctx.params.sessionID, cause }).pipe(
            Effect.as(undefined),
          ),
        ),
        Effect.map((text) => ({ text })),
      ),
    )
  }),
)

function text(message: SessionV1.WithParts) {
  return message.parts
    .flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : []))
    .join("\n")
    .trim()
}
