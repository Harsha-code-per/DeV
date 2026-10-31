import { describe, expect, test } from "bun:test"
import { APICallError, type LanguageModelV3 } from "@ai-sdk/provider"
import { AutoProvider } from "@/provider/auto"
import type { Provider } from "@/provider/provider"

const model = (providerID: string, id: string, cost = 1) =>
  ({
    id,
    providerID,
    capabilities: { toolcall: true },
    cost: { input: cost, output: cost },
    limit: { context: 100_000 },
    release_date: "2026-01-01",
  }) as unknown as Provider.Model

const fake = (result: () => Promise<unknown>) =>
  ({ doGenerate: result, doStream: result }) as unknown as LanguageModelV3

const rateLimited = new APICallError({
  message: "Too Many Requests",
  url: "https://example.com",
  requestBodyValues: {},
  statusCode: 429,
})

describe("AutoProvider", () => {
  test("falls through to the next candidate on 429 and cools the failed one", async () => {
    const groq = model("groq", "a")
    const cerebras = model("cerebras", "b")
    const calls: string[] = []
    const lm = AutoProvider.language([
      { model: groq, language: fake(async () => (calls.push("groq"), Promise.reject(rateLimited))) },
      { model: cerebras, language: fake(async () => (calls.push("cerebras"), { content: [] })) },
    ])
    expect(await lm.doGenerate({ prompt: [] } as never)).toEqual({ content: [] } as never)
    expect(calls).toEqual(["groq", "cerebras"])

    // groq is cooling down, so the next request ranks cerebras first
    const providers = {
      groq: { id: "groq", models: { a: groq } },
      cerebras: { id: "cerebras", models: { b: cerebras } },
    } as unknown as Record<string, Provider.Info>
    expect(AutoProvider.candidates(providers).map((m) => String(m.providerID))).toEqual(["cerebras", "groq"])
  })

  test("only models confirmed free are candidates, not ones with a missing price", () => {
    const providers = {
      anyapi: { id: "anyapi", models: { unpriced: model("anyapi", "unpriced", 0) } },
      openrouter: {
        id: "openrouter",
        models: { paid: model("openrouter", "paid", 5), free: model("openrouter", "free-model:free", 0) },
      },
    } as unknown as Record<string, Provider.Info>
    expect(AutoProvider.candidates(providers).map((m) => String(m.id))).toEqual(["free-model:free"])
  })

  test("moves on when a candidate never starts responding", async () => {
    const hanging = {
      doStream: (options: { abortSignal?: AbortSignal }) =>
        new Promise((_, reject) => options.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")))),
    } as unknown as LanguageModelV3
    const ok = fake(async () => ({ stream: new ReadableStream({ start: (c) => c.close() }) }))
    const lm = AutoProvider.language(
      [
        { model: model("groq", "hang"), language: hanging },
        { model: model("cerebras", "ok"), language: ok },
      ],
      { firstResponseMs: 50 },
    )
    const started = Date.now()
    const result = await lm.doStream({ prompt: [] } as never)
    expect(result.stream).toBeDefined()
    expect(Date.now() - started).toBeLessThan(2000)
  })

  test("surfaces a context overflow over later unrelated failures", async () => {
    const tooLarge = new APICallError({
      message: "request entity too large",
      url: "https://example.com",
      requestBodyValues: {},
      statusCode: 413,
    })
    const lm = AutoProvider.language([
      { model: model("test", "small"), language: fake(() => Promise.reject(tooLarge)) },
      { model: model("groq", "y"), language: fake(() => Promise.reject(rateLimited)) },
    ])
    await expect(lm.doGenerate({ prompt: [] } as never)).rejects.toBe(tooLarge as never)
  })

  test("gives a clear error with the last failure when every candidate fails", async () => {
    const lm = AutoProvider.language([{ model: model("groq", "x"), language: fake(() => Promise.reject(rateLimited)) }])
    await expect(lm.doGenerate({ prompt: [] } as never)).rejects.toThrow("No free model answered")
  })

  test("ranks free models by how often they have answered", () => {
    const flaky = model("groq", "flaky")
    const steady = model("mistral", "steady")
    const fresh = model("nvidia", "fresh")
    for (let i = 0; i < 4; i++) AutoProvider.record(flaky, false)
    for (let i = 0; i < 4; i++) AutoProvider.record(steady, true)
    expect(AutoProvider.score(fresh)).toBe(0.5)
    const providers = {
      groq: { id: "groq", models: { flaky } },
      mistral: { id: "mistral", models: { steady } },
      nvidia: { id: "nvidia", models: { fresh } },
    } as unknown as Record<string, Provider.Info>
    // Reliable first, untried in the middle (so new models still get a chance), unreliable last.
    expect(AutoProvider.candidates(providers).map((m) => String(m.id))).toEqual(["steady", "fresh", "flaky"])
  })
})

describe("AutoProvider routing", () => {
  const quota = new APICallError({
    message: "You exceeded your current quota, please check your plan and billing details.",
    url: "https://example.com",
    requestBodyValues: {},
    statusCode: 429,
  })

  test("reports progress for the session, and gives up with a clear error", async () => {
    const messages: (string | undefined)[] = []
    const unwatch = AutoProvider.watch("s1", (message) => messages.push(message))
    const first = { ...model("groq", "budget-a"), name: "Model A" } as Provider.Model
    const second = { ...model("google", "budget-b"), name: "Model B" } as Provider.Model
    const lm = AutoProvider.language([
      { model: first, language: fake(() => Promise.reject(quota)) },
      { model: second, language: fake(() => Promise.reject(quota)) },
    ])
    await expect(lm.doGenerate({ prompt: [], headers: { "X-Session-Id": "s1" } } as never)).rejects.toThrow(
      "No free model answered",
    )
    expect(messages).toContain("Model A is rate limited, trying Model B…")
    unwatch()
  })

  test("a spent quota stays cooled down across runs", () => {
    const spent = model("cerebras", "spent")
    const fresh = model("cerebras", "fresh")
    const now = Date.now()
    AutoProvider.cool(spent, quota, now)
    const providers = { cerebras: { id: "cerebras", models: { spent, fresh } } } as unknown as Record<
      string,
      Provider.Info
    >
    expect(AutoProvider.candidates(providers, now + 600_000).map((m) => String(m.id))).toEqual(["fresh", "spent"])
    expect(AutoProvider.candidates(providers, now + 3_700_000).at(-1)?.id).toBeDefined()
  })
})
