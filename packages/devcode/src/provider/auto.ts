import {
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3Prompt,
  type LanguageModelV3StreamPart,
} from "@ai-sdk/provider"
import { APICallError } from "ai"
import { sortBy } from "remeda"
import type { Provider } from "./provider"
import { ProviderError } from "./error"
import { ProviderTransform } from "./transform"
import path from "path"
import { Global } from "@dev-ai/core/global"
import fs from "fs/promises"

// DeV: virtual "auto" provider. Its single model routes each request across every free
// model from the connected providers and falls through to the next one on any failure.

export const ID = "auto"
export const MODEL = "free"
const MAX_CANDIDATES = 8
// ponytail: one window for every candidate; per-provider latency stats would let slow-but-good
// providers have longer.
const FIRST_RESPONSE_MS = 12_000
// However many candidates fail, the user gets an answer or a clear error within this time.
const TOTAL_BUDGET_MS = 45_000
// Say what's happening once the wait is long enough to be noticed.
const STATUS_AFTER_MS = 2_000

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
  "freellmapi",
])

const cooldown = new Map<string, number>()

// Measured quality: how often each free model answered without an error, kept across runs, so the
// router learns which free models actually work for this user. Unknown models start neutral.
// ponytail: one score per model; per task type (edit vs chat vs long context) would rank finer.
const STATS_FILE = path.join(Global.Path.state, "auto-free-stats.json")
// `output` is a reply allowance learnt for the model: larger than the catalogue lists once a reply was
// cut off at it, or REFUSED once the provider turned the larger one down.
const stats: Record<string, { ok: number; fail: number; until?: number; budget?: number; output?: number }> = await fs
  .readFile(STATS_FILE, "utf8")
  .then((text) => JSON.parse(text))
  .catch(() => ({}))
let saving: ReturnType<typeof setTimeout> | undefined

/** Laplace-smoothed success rate: 0.5 with no history. */
export function score(model: Provider.Model) {
  const entry = stats[key(model)]
  return ((entry?.ok ?? 0) + 1) / ((entry?.ok ?? 0) + (entry?.fail ?? 0) + 2)
}

export function record(model: Provider.Model, ok: boolean, until?: number) {
  const entry = (stats[key(model)] ??= { ok: 0, fail: 0 })
  if (ok) entry.ok++
  if (!ok) entry.fail++
  entry.until = until
  // Halve old counts so recent behaviour matters most.
  if (entry.ok + entry.fail > 50) {
    entry.ok = Math.round(entry.ok / 2)
    entry.fail = Math.round(entry.fail / 2)
  }
  save()
}

const REFUSED = -1

/**
 * A reply that stopped at the allowance gets twice as much next time. Thinking counts against the
 * allowance, and some catalogue limits are far below what the provider accepts, so a model can spend
 * all of it before writing a word, on every retry.
 */
function grow(model: Provider.Model, asked: number | undefined) {
  const entry = (stats[key(model)] ??= { ok: 0, fail: 0 })
  if (!asked || entry.output === REFUSED) return
  // A quarter of the context at most, so the allowance alone can't push a request over the window.
  const most = Math.min(ProviderTransform.OUTPUT_TOKEN_MAX, Math.floor(model.limit.context / 4))
  if (asked >= most) return
  entry.output = Math.min(asked * 2, most)
  save()
}

function save() {
  saving ??= setTimeout(() => {
    saving = undefined
    void fs
      .mkdir(path.dirname(STATS_FILE), { recursive: true })
      .then(() => fs.writeFile(STATS_FILE, JSON.stringify(stats)))
      .catch(() => {})
  }, 2000)
  saving.unref?.()
}

// Below this a model can't take even a lean request, so the router skips it.
const MIN_BUDGET = 4_000
// A rate limit that clears this soon is worth waiting out instead of failing the request.
const MAX_PAUSE_MS = 20_000
// Tools a lean request keeps, and prompt sections it drops.
const LEAN_TOOLS = new Set([
  "bash",
  "read",
  "edit",
  "write",
  "grep",
  "glob",
  "todowrite",
  "question",
  "plan_enter",
  "plan_exit",
  "goal_set",
])
const LEAN_DROP = [
  /<available_skills>[\s\S]*?<\/available_skills>/g,
  /<mcp_instructions>[\s\S]*?<\/mcp_instructions>/g,
  /<example>[\s\S]*?<\/example>/g,
  /# Ponytail[\s\S]*$/,
]

// Plan mode's long workflow alone is a third of a small budget.
const LEAN_PLAN_WORKFLOW = /## Plan Workflow[\s\S]*(?=<\/system-reminder>)/
const LEAN_PLAN_STEPS = "Read what you need, write the plan to the plan file, then call plan_exit.\n"

/**
 * Free tiers can cap tokens per minute below one full request (all of Groq's are 8,000), so a model
 * that rejects a full request gets a lean one, and the limit is kept so later requests skip the rejection.
 * ponytail: a lean request has no skills, MCP tools or subagents, and text patterns find the sections
 * to drop. Named prompt sections would be sturdier if these patterns start to miss.
 */
export function fit(language: LanguageModelV3, model: Provider.Model): LanguageModelV3 {
  if (!isFree(model)) return language
  const call = async <T>(
    options: LanguageModelV3CallOptions,
    run: (options: LanguageModelV3CallOptions) => PromiseLike<T>,
  ) => {
    const budget = stats[key(model)]?.budget
    if (budget !== undefined && size(options) > budget) return run(lean(options))
    return Promise.resolve(run(options)).catch((error) => {
      const limit = perMinuteLimit(error)
      if (limit === undefined) throw error
      stats[key(model)] = { ...(stats[key(model)] ?? { ok: 0, fail: 0 }), budget: limit }
      save()
      return run(lean(options))
    })
  }
  return {
    specificationVersion: "v3",
    provider: language.provider,
    modelId: language.modelId,
    supportedUrls: language.supportedUrls,
    doGenerate: (options) => call(options, (next) => language.doGenerate(next)),
    doStream: (options) => call(options, (next) => language.doStream(next)),
  }
}

function lean(options: LanguageModelV3CallOptions): LanguageModelV3CallOptions {
  return {
    ...options,
    prompt: options.prompt.map((message) => {
      if (message.role === "system")
        return { ...message, content: LEAN_DROP.reduce((text, section) => text.replace(section, ""), message.content) }
      if (message.role !== "user") return message
      return {
        ...message,
        content: message.content
          .filter((part) => part.type !== "text" || !part.text.startsWith("<EXTREMELY_IMPORTANT>"))
          .map((part) =>
            part.type === "text" ? { ...part, text: part.text.replace(LEAN_PLAN_WORKFLOW, LEAN_PLAN_STEPS) } : part,
          ),
      }
    }),
    tools: options.tools
      ?.filter((tool) => LEAN_TOOLS.has(tool.name))
      .map((tool) =>
        tool.type === "function" ? { ...tool, description: tool.description?.split("\n\n")[0]?.slice(0, 300) } : tool,
      ),
  }
}

/** Rough token count; JSON runs a little above the provider's own count, which errs on the safe side. */
function size(options: LanguageModelV3CallOptions) {
  return JSON.stringify([options.prompt, options.tools]).length / 4
}

function perMinuteLimit(error: unknown) {
  if (!APICallError.isInstance(error) || error.statusCode !== 413) return undefined
  const limit = /per minute.*?limit\D*(\d+)/i.exec(error.message)?.[1]
  return limit ? Number(limit) : undefined
}

// What the session shows while the router works; keyed by session because one router serves them all.
type Listener = (message: string | undefined, served?: Provider.Model) => void
const watchers = new Map<string, Listener>()
// The free model last answering each session, so the advisor can ask a different one.
const served = new Map<string, Provider.Model>()

export function servedBy(sessionID: string) {
  return served.get(sessionID)
}

/**
 * Reports routing progress for a session. An undefined message means a model has started answering;
 * `served` is that model, so the session can show which free model is actually replying.
 */
export function watch(sessionID: string, listener: Listener) {
  watchers.set(sessionID, listener)
  return () => {
    watchers.delete(sessionID)
  }
}

// Explicit on purpose: a catalog price of 0 can just mean the price is missing, and DeV must never
// spend the user's money without being asked.
function isFree(model: Provider.Model) {
  if (FREE_TIER.has(model.providerID) || model.id.endsWith(":free")) return true
  return false
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
          .filter((m) => isFree(m))
          .filter((m) => (stats[key(m)]?.budget ?? MIN_BUDGET) >= MIN_BUDGET),
        (m) => m.cost.input,
        [(m) => m.limit.context, "desc"],
        [(m) => m.release_date, "desc"],
      ),
    )
  const interleaved = Array.from({ length: Math.max(0, ...groups.map((g) => g.length)) }, (_, i) =>
    groups.flatMap((g) => (g[i] ? [g[i]] : [])),
  ).flat()
  // Models on cooldown go last; among the rest, the most reliable first (stable, so ties keep the interleave).
  const ranked = sortBy(interleaved, (m) => cooling(m, now), [(m) => score(m), "desc"])
  // The best few that read each kind of attachment come along too, so a request with an image can reach
  // a model that sees it even when the top-ranked ones are text-only. language() picks per request.
  const readers = MEDIA.flatMap((kind) => ranked.filter((m) => m.capabilities.input?.[kind]).slice(0, 3))
  return [...new Set([...ranked.slice(0, MAX_CANDIDATES), ...readers])]
}

const MEDIA = ["image", "pdf", "audio", "video"] as const

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
          // It takes every kind of attachment and routes a request that has one to a free model that reads it.
          attachment: true,
          toolcall: true,
          input: { text: true, audio: true, image: true, video: true, pdf: true },
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
  opts: { firstResponseMs?: number; totalBudgetMs?: number } = {},
): LanguageModelV3 {
  const attempt = async <T>(
    options: LanguageModelV3CallOptions,
    windowMs: number,
    run: (item: (typeof list)[number], options: LanguageModelV3CallOptions) => PromiseLike<T>,
  ) => {
    const signal = options.abortSignal
    const report: Listener = (message, model) => {
      const session = options.headers?.["X-Session-Id"] ?? ""
      if (model && session) served.set(session, model)
      watchers.get(session)?.(message, model)
    }
    const started = Date.now()
    const budget = opts.totalBudgetMs ?? TOTAL_BUDGET_MS
    const errors: unknown[] = []
    // Models that read every attachment in the request go first; the rest get it described as unreadable.
    const kinds = attachments(options.prompt)
    const reads = (model: Provider.Model) => kinds.every((kind) => model.capabilities.input?.[kind])
    const tries = [...list.filter((item) => reads(item.model)), ...list.filter((item) => !reads(item.model))].slice(
      0,
      MAX_CANDIDATES,
    )
    for (const round of [0, 1]) {
      for (const [index, item] of tries.entries()) {
        if (signal?.aborted) throw signal.reason
        if (Date.now() - started > budget) break
        const name = item.model.name ?? item.model.id
        const waiting = setTimeout(() => report(`Waiting for ${name}…`), STATUS_AFTER_MS)
        // Free endpoints sometimes accept the connection and never answer. Give each candidate a
        // short window to start responding (headers or full result), then move on to the next.
        const deadline = new AbortController()
        const timer = setTimeout(() => deadline.abort(new Error(`${key(item.model)} did not respond`)), windowMs)
        const learned = stats[key(item.model)]?.output ?? 0
        try {
          const result = await run(item, {
            ...options,
            prompt: reads(item.model) ? options.prompt : unreadable(options.prompt, item.model),
            // The router's own limit is a guess that fits every model. A model that thinks first spends
            // its thinking from the same allowance, so each one gets as much as it really allows.
            maxOutputTokens:
              options.maxOutputTokens &&
              Math.max(
                options.maxOutputTokens,
                Math.min(item.model.limit.output || 0, ProviderTransform.OUTPUT_TOKEN_MAX),
                learned,
              ),
            abortSignal: signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal,
          })
          report(undefined, item.model)
          return result
        } catch (e) {
          if (signal?.aborted) throw e
          // The learnt allowance was more than the catalogue lists; a provider that rejects the request keeps the listed one.
          if (learned > 0 && APICallError.isInstance(e) && e.statusCode === 400) {
            stats[key(item.model)]!.output = REFUSED
            save()
          }
          cool(item.model, e)
          errors.push(e)
          const next = tries[index + 1]
          if (next) report(`${name} ${problem(e)}, trying ${next.model.name ?? next.model.id}…`)
        } finally {
          clearTimeout(timer)
          clearTimeout(waiting)
        }
      }
      // Every model refused. On a free tier that is usually a limit about to clear.
      const pause = round === 0 ? shortestCooldown(tries.map((item) => item.model)) : undefined
      if (pause === undefined || Date.now() - started + pause > budget) break
      report(`Free models are rate limited, retrying in ${Math.ceil(pause / 1000)}s…`)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pause)
        signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true })
      })
    }
    report(undefined)
    // A context overflow must surface even if later candidates failed for other reasons:
    // it is what triggers compaction, the session's real recovery.
    const limit = errors.map(perMinuteLimit).find((value) => value !== undefined)
    throw (
      errors.find((e) => overflow(e)) ??
      new Error(
        limit !== undefined
          ? `This conversation is too large for your free models (limit ${limit} tokens a minute). Start a new session with /new, or connect a free provider with more room, such as NVIDIA or Google, with /connect.`
          : errors.length > 0
            ? `No free model answered (tried ${errors.length}; last: ${String(errors.at(-1)).slice(0, 160)}). Try again shortly, or add another free provider with /connect.`
            : "No free models available. Connect a provider with /connect.",
      )
    )
  }
  return {
    specificationVersion: "v3",
    provider: ID,
    modelId: MODEL,
    supportedUrls: {},
    doGenerate: (options) =>
      // Non-streaming: the window covers the whole answer, so it is longer.
      attempt(options, (opts.firstResponseMs ?? FIRST_RESPONSE_MS) * 4, async (item, next) => {
        const result = await item.language.doGenerate(next)
        record(item.model, true)
        return result
      }),
    doStream: (options) =>
      attempt(options, opts.firstResponseMs ?? FIRST_RESPONSE_MS, async (item, next) => {
        // The deadline only guards the wait for headers; once streaming starts it is cleared.
        const result = await item.language.doStream(next)
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
                if (part.type === "finish" && part.finishReason.unified === "length")
                  grow(item.model, next.maxOutputTokens)
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

/** The kinds of attachment the person sent, which decide which free models can answer. */
function attachments(prompt: LanguageModelV3Prompt) {
  const kinds = prompt.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((part) => {
          const kind = part.type === "file" ? ProviderTransform.mimeToModality(part.mediaType) : undefined
          return kind ? [kind] : []
        })
      : [],
  )
  return [...new Set(kinds)]
}

// For a model that can't read an attachment (when every one that can is busy or none is connected), the
// attachment becomes a note the model passes on, instead of an error from the provider.
// ponytail: only the person's own attachments; media inside tool results go to the model unchanged.
function unreadable(prompt: LanguageModelV3Prompt, model: Provider.Model): LanguageModelV3Prompt {
  return prompt.map((message) => {
    if (message.role !== "user") return message
    return {
      ...message,
      content: message.content.map((part) => {
        const kind = part.type === "file" ? ProviderTransform.mimeToModality(part.mediaType) : undefined
        if (part.type !== "file" || !kind || model.capabilities.input?.[kind]) return part
        return {
          type: "text" as const,
          text: `ERROR: Cannot read ${part.filename ? `"${part.filename}"` : kind}: no free model that reads ${kind} input is available right now. Tell the user, and that connecting Google with /connect adds free Gemini models that read images, PDFs, audio and video.`,
        }
      }),
    }
  })
}

export function cool(model: Provider.Model, error: unknown, now = Date.now()) {
  // Too big for this model's budget says nothing about the model, and smaller requests still pass.
  if (perMinuteLimit(error) !== undefined) return
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  const retryAfter = APICallError.isInstance(error) ? Number(error.responseHeaders?.["retry-after"]) : NaN
  const ms = wait(status, retryAfter, error)
  cooldown.set(key(model), now + ms)
  // A rejected oversized request says nothing about the model's quality. Long cooldowns outlive this
  // process, so the next run doesn't walk the same exhausted models.
  if (!overflow(error)) record(model, false, ms >= 60_000 ? now + ms : undefined)
}

function shortestCooldown(models: Provider.Model[], now = Date.now()) {
  const pause = Math.min(...models.map((model) => (cooldown.get(key(model)) ?? 0) - now))
  return pause > 0 && pause <= MAX_PAUSE_MS ? pause : undefined
}

function cooling(model: Provider.Model, now: number) {
  return Math.max(cooldown.get(key(model)) ?? 0, stats[key(model)]?.until ?? 0) > now
}

function problem(error: unknown) {
  if (perMinuteLimit(error) !== undefined) return "can't take a request this large"
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  if (status === 429) return "is rate limited"
  if (status === 401 || status === 403) return "rejected the key"
  if (status !== undefined && status >= 500) return "is busy"
  if (status === undefined) return "didn't respond"
  return "failed"
}

function wait(status: number | undefined, retryAfter: number, error: unknown) {
  if (!Number.isNaN(retryAfter) && retryAfter > 0) return retryAfter * 1000
  // A spent daily quota won't come back in a minute.
  if (status === 429 && /quota|billing|limit: 0/i.test(error instanceof Error ? error.message : "")) return 3_600_000
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
