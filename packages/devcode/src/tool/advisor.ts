import { generateText } from "ai"
import { Effect, Schema } from "effect"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { AutoProvider } from "@/provider/auto"
import { ModelV2 } from "@dev-ai/core/model"
import { ProviderV2 } from "@dev-ai/core/provider"
import * as Tool from "./tool"
import DESCRIPTION from "./advisor.txt"

// The advisor: when a free model is stuck or facing a costly design choice, it asks a stronger model and gets
// advice back, then carries on itself. The model is `advisor_model` from config, or else the strongest free one
// available. Turn it off with "permission": { "advisor": "deny" }.

export const Parameters = Schema.Struct({
  question: Schema.String.annotate({
    description: "The decision or problem, with the goal, the relevant code or error, and what you already tried",
  }),
})

const MAX_PER_SESSION = 5
const used = new Map<string, number>()

const SYSTEM = [
  "You are a senior engineer advising another coding agent that is stuck or facing a hard decision.",
  "Give a clear recommendation and the reason for it, the likely cause if it's a bug, and the next concrete step.",
  "Be brief and specific. Point out a wrong assumption if you see one. Don't write long code.",
].join("\n")

type Metadata = { model?: string }

export const AdvisorTool = Tool.define<typeof Parameters, Metadata, Provider.Service | Config.Service>(
  "advisor",
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const config = yield* Config.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const count = used.get(ctx.sessionID) ?? 0
          if (count >= MAX_PER_SESSION)
            return { title: "Advisor limit reached", output: "This session has used the advisor enough; decide yourself.", metadata: {} }
          const model = yield* pick(ctx.sessionID)
          if (!model) return { title: "No advisor available", output: "No stronger model is available; decide yourself.", metadata: {} }
          used.set(ctx.sessionID, count + 1)
          const language = yield* provider.getLanguage(model)
          const text = yield* Effect.promise(() =>
            generateText({
              model: language,
              system: SYSTEM,
              prompt: params.question,
              maxOutputTokens: 2000,
              abortSignal: AbortSignal.any([ctx.abort, AbortSignal.timeout(120_000)]),
            }).then(
              (result) => result.text.trim(),
              (error: unknown) => `The advisor couldn't answer: ${error instanceof Error ? error.message : String(error)}`,
            ),
          )
          return {
            title: `Advice from ${model.name ?? model.id}`,
            output: text || "The advisor gave no answer; decide yourself.",
            metadata: { model: `${model.providerID}/${model.id}` },
          }
        }).pipe(Effect.orDie),
    }

    // advisor_model when set; otherwise the free model most likely to be strongest.
    // ponytail: "reasoning, then largest context" is a proxy for strength; use a quality ranking if the catalog gets one.
    function pick(sessionID: string) {
      return Effect.gen(function* () {
        const configured = (yield* config.get()).advisor_model
        if (configured) {
          const [providerID, ...rest] = configured.split("/")
          return yield* provider
            .getModel(ProviderV2.ID.make(providerID!), ModelV2.ID.make(rest.join("/")))
            .pipe(Effect.orElseSucceed(() => undefined))
        }
        // Never the model already doing the work: asking it again is no escalation.
        const current = AutoProvider.servedBy(sessionID)
        const free = AutoProvider.candidates(yield* provider.list()).filter(
          (model) => !current || model.providerID !== current.providerID || model.id !== current.id,
        )
        return free.toSorted(
          (a, b) => Number(b.capabilities.reasoning) - Number(a.capabilities.reasoning) || b.limit.context - a.limit.context,
        )[0]
      })
    }
  }),
)
