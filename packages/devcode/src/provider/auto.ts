import { type LanguageModelV3, type LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { APICallError } from "ai"
import { sortBy } from "remeda"
import type { Provider } from "./provider"
import { ProviderError } from "./error"
import path from "path"
import { Global } from "@dev-ai/core/global"
import fs from "fs/promises"

// DeV: virtual "auto" provider. Its single model routes each request across every free
// model from the connected providers and falls through to the next one on any failure.

export const ID = "auto"
export const MODEL = "free"
const MAX_CANDIDATES = 12
// ponytail: one window for every candidate; per-provider latency stats would let slow-but-good
// providers have longer.
const FIRST_RESPONSE_MS = 30_000

// Providers whose models are usable on a free tier even though models.dev lists paid prices.
// ponytail: static list, swap for a live free-tier catalog (e.g. freellmapi's) if it drifts.
const FREE_TIER = new Set([
  "groq",
  "cerebras",
  "google",
  "mistral",
  "nvidia",
  "cohere",
  "huggingface",
  "github-models",
  "cloudflare-workers-ai",
  "ollama",
  "lmstudio",
])

const cooldown = new Map<string, number>()

// Measured quality: how often each free model answered without an error, kept across runs, so the
// router learns which free models actually work for this user. Unknown models start neutral.
// ponytail: one score per model; per task type (edit vs chat vs long context) would rank finer.
const STATS_FILE = path.join(Global.Path.state, "auto-free-stats.json")
const stats: Record<string, { ok: number; fail: number }> = await fs
  .readFile(STATS_FILE, "utf8")
  .then((text) => JSON.parse(text))
  .catch(() => ({}))
let saving: ReturnType<typeof setTimeout> | undefined

/** Laplace-smoothed success rate: 0.5 with no history. */
export function score(model: Provider.Model) {
  const entry = stats[key(model)]
  return ((entry?.ok ?? 0) + 1) / ((entry?.ok ?? 0) + (entry?.fail ?? 0) + 2)
}

export function record(model: Provider.Model, ok: boolean) {
  const entry = (stats[key(model)] ??= { ok: 0, fail: 0 })
  if (ok) entry.ok++
  if (!ok) entry.fail++
  // Halve old counts so recent behaviour matters most.
  if (entry.ok + entry.fail > 50) {
    entry.ok = Math.round(entry.ok / 2)
    entry.fail = Math.round(entry.fail / 2)
  }
  saving ??= setTimeout(() => {
    saving = undefined
    void fs
      .mkdir(path.dirname(STATS_FILE), { recursive: true })
      .then(() => fs.writeFile(STATS_FILE, JSON.stringify(stats)))
      .catch(() => {})
  }, 2000)
  saving.unref?.()
}

export function candidates(providers: Record<string, Provider.Info>, now = Date.now()) {
  // Rank within each provider, then interleave providers so one broken provider
  // (bad key, unsupported plan) can't fill every slot.
  const groups = Object.values(providers)
    .filter((p) => p.id !== ID)
    .map((p) =>
      sortBy(
        Object.values(p.models)
          .filter((m) => m.capabilities.toolcall)
          .filter((m) => FREE_TIER.has(m.providerID) || (m.cost.input === 0 && m.cost.output === 0)),
        (m) => m.cost.input,
        [(m) => m.limit.context, "desc"],
        [(m) => m.release_date, "desc"],
      ),
    )
  const interleaved = Array.from({ length: Math.max(0, ...groups.map((g) => g.length)) }, (_, i) =>
    groups.flatMap((g) => (g[i] ? [g[i]] : [])),
  ).flat()
  // Models on cooldown go last; among the rest, the most reliable first (stable, so ties keep the interleave).
  return sortBy(interleaved, (m) => (cooldown.get(key(m)) ?? 0) > now, [(m) => score(m), "desc"]).slice(
    0,
    MAX_CANDIDATES,
  )
}

export function info(providers: Record<string, Provider.Info>): Provider.Info | undefined {
  if (candidates(providers).length === 0) return undefined
  return {
    id: ID as Provider.Info["id"],
    name: "DeV Auto (free)",
    source: "custom",
    env: [],
    options: {},
    models: {
      [MODEL]: {
        id: MODEL as Provider.Model["id"],
        providerID: ID as Provider.Model["providerID"],
        api: { id: MODEL, url: "", npm: "@ai-sdk/openai-compatible" },
        name: "Auto (best free model)",
        capabilities: {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: true,
          input: { text: true, audio: false, image: false, video: false, pdf: false },
          output: { text: true, audio: false, image: false, video: false, pdf: false },
          interleaved: false,
        },
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
        // ponytail: fixed window; a candidate with a smaller context errors and the next one is tried.
        limit: { context: 128_000, output: 8_192 },
        status: "active",
        options: {},
        headers: {},
        release_date: "",
        variants: {},
      },
    },
  }
}

export function language(
  list: { model: Provider.Model; language: LanguageModelV3 }[],
  opts: { firstResponseMs?: number } = {},
): LanguageModelV3 {
  const attempt = async <T>(
    signal: AbortSignal | undefined,
    windowMs: number,
    run: (item: (typeof list)[number], signal: AbortSignal) => PromiseLike<T>,
  ) => {
    const errors: unknown[] = []
    for (const item of list) {
      if (signal?.aborted) throw signal.reason
      // Free endpoints sometimes accept the connection and never answer. Give each candidate a
      // short window to start responding (headers or full result), then move on to the next.
      const deadline = new AbortController()
      const timer = setTimeout(() => deadline.abort(new Error(`${key(item.model)} did not respond`)), windowMs)
      try {
        return await run(item, signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal)
      } catch (e) {
        if (signal?.aborted) throw e
        cool(item.model, e)
        errors.push(e)
      } finally {
        clearTimeout(timer)
      }
    }
    // A context overflow must surface even if later candidates failed for other reasons:
    // it is what triggers compaction, the session's real recovery.
    throw (
      errors.find((e) => overflow(e)) ??
      errors.at(-1) ??
      new Error("No free models available. Connect a provider with /connect.")
    )
  }
  return {
    specificationVersion: "v3",
    provider: ID,
    modelId: MODEL,
    supportedUrls: {},
    doGenerate: (options) =>
      // Non-streaming: the window covers the whole answer, so it is longer.
      attempt(options.abortSignal, (opts.firstResponseMs ?? FIRST_RESPONSE_MS) * 4, async (item, abortSignal) => {
        const result = await item.language.doGenerate({ ...options, abortSignal })
        record(item.model, true)
        return result
      }),
    doStream: (options) =>
      attempt(options.abortSignal, opts.firstResponseMs ?? FIRST_RESPONSE_MS, async (item, abortSignal) => {
        // The deadline only guards the wait for headers; once streaming starts it is cleared.
        const result = await item.language.doStream({ ...options, abortSignal })
        const seen = { error: false }
        return {
          ...result,
          stream: result.stream.pipeThrough(
            new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
              transform(part, controller) {
                if (part.type === "error") {
                  seen.error = true
                  cool(item.model, part.error)
                }
                controller.enqueue(part)
              },
              flush() {
                if (!seen.error) record(item.model, true)
              },
            }),
          ),
        }
      }),
  }
}

export function cool(model: Provider.Model, error: unknown, now = Date.now()) {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  const retryAfter = APICallError.isInstance(error) ? Number(error.responseHeaders?.["retry-after"]) : NaN
  const ms = wait(status, retryAfter)
  cooldown.set(key(model), now + ms)
  // A rejected oversized request says nothing about the model's quality.
  if (!overflow(error)) record(model, false)
}

function wait(status: number | undefined, retryAfter: number) {
  if (!Number.isNaN(retryAfter) && retryAfter > 0) return retryAfter * 1000
  if (status === 429) return 60_000
  // Other 4xx (bad key, unsupported model or plan) won't fix itself soon.
  if (status !== undefined && status >= 400 && status < 500) return 600_000
  return 15_000
}

function overflow(error: unknown) {
  return (
    APICallError.isInstance(error) &&
    ProviderError.parseAPICallError({ providerID: "auto" as Provider.Model["providerID"], error }).type ===
      "context_overflow"
  )
}

function key(model: Provider.Model) {
  return `${model.providerID}/${model.id}`
}

export * as AutoProvider from "./auto"
