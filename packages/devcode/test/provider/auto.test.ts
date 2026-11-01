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

const tooLargePerMinute = new APICallError({
  message:
    "Request too large for model `a` on tokens per minute (TPM): Limit 8000, Requested 18980, please reduce your message size",
  url: "https://example.com",
  requestBodyValues: {},
  statusCode: 413,
})

const fullRequest = (): any =>
  ({
    prompt: [
      {
        role: "system",
        content:
          "You are DeV.\n<available_skills>many skills</available_skills>\n<mcp_instructions>servers</mcp_instructions>\n<example>long</example>\nBe direct.\n# Ponytail\nmore rules",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "<EXTREMELY_IMPORTANT>bootstrap</EXTREMELY_IMPORTANT>" },
          { type: "text", text: "hi" },
        ],
      },
    ],
    tools: [
      { type: "function", name: "bash", description: "Run a command.\n\nPages of detail.", inputSchema: {} },
      { type: "function", name: "execute", description: "Code mode.", inputSchema: {} },
    ],
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

  test("a per-minute budget too small for the request retries lean and is remembered", async () => {
    const small = model("groq", `budget-${Date.now()}`)
    const seen: any[] = []
    const lm = AutoProvider.fit(
      fake(async (...args: any[]) => {
        seen.push(args[0])
        if (seen.length === 1) throw tooLargePerMinute
        return { content: [] }
      }),
      small,
    )

    expect(await lm.doGenerate(fullRequest())).toEqual({ content: [] } as never)
    expect(seen).toHaveLength(2)
    const lean = seen[1]
    expect(lean.prompt[0].content).toBe("You are DeV.\n\n\n\nBe direct.\n")
    expect(lean.prompt[1].content).toEqual([{ type: "text", text: "hi" }])
    expect(lean.tools).toEqual([{ type: "function", name: "bash", description: "Run a command.", inputSchema: {} }])

    // The limit is learned, so the next oversized request goes lean straight away.
    await lm.doGenerate({
      ...fullRequest(),
      tools: [{ type: "function", name: "bash", description: "x".repeat(40_000) }],
    } as never)
    expect(seen).toHaveLength(3)
    expect(seen[2].tools[0].description.length).toBeLessThan(400)
  })

  test("other errors are not treated as a budget problem", async () => {
    const calls: string[] = []
    const lm = AutoProvider.fit(
      fake(async () => {
        calls.push("x")
        throw rateLimited
      }),
      model("groq", "other-errors"),
    )
    await expect(lm.doGenerate(fullRequest())).rejects.toBe(rateLimited)
    expect(calls).toHaveLength(1)
  })

  test("paid models are never rewritten", () => {
    const paid = fake(async () => ({ content: [] }))
    expect(AutoProvider.fit(paid, model("anthropic", "claude"))).toBe(paid)
  })

  test("a request over the budget doesn't cool the model, since smaller ones still pass", async () => {
    const small = model("groq", `no-cool-${Date.now()}`)
    AutoProvider.cool(small, tooLargePerMinute)
    const providers = { groq: { id: "groq", models: { a: small } } } as unknown as Record<string, Provider.Info>
    expect(AutoProvider.candidates(providers)).toEqual([small])
    expect(AutoProvider.score(small)).toBe(0.5)
  })

  test("waits out a short rate limit when every model refused, and says so", async () => {
    const limited = new APICallError({
      message: "Too Many Requests",
      url: "https://example.com",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { "retry-after": "1" },
    })
    const calls: string[] = []
    const reports: (string | undefined)[] = []
    const unwatch = AutoProvider.watch("session", (message) => reports.push(message))
    const lm = AutoProvider.language([
      {
        model: model("groq", "short-limit"),
        language: fake(async () => {
          calls.push("groq")
          if (calls.length === 1) throw limited
          return { content: [] }
        }),
      },
    ])
    expect(await lm.doGenerate({ prompt: [], headers: { "X-Session-Id": "session" } } as never)).toEqual({
      content: [],
    } as never)
    unwatch()
    expect(calls).toEqual(["groq", "groq"])
    expect(reports).toContain("Free models are rate limited, retrying in 1s…")
  })

  test("a model that can't fit even a lean request stops being a candidate", async () => {
    const tiny = model("groq", `tiny-${Date.now()}`)
    const tooSmall = new APICallError({
      message: "Request too large on tokens per minute (TPM): Limit 2000, Requested 3133",
      url: "https://example.com",
      requestBodyValues: {},
      statusCode: 413,
    })
    const lm = AutoProvider.fit(
      fake(async () => {
        throw tooSmall
      }),
      tiny,
    )
    await expect(lm.doGenerate(fullRequest())).rejects.toBe(tooSmall)
    const providers = { groq: { id: "groq", models: { a: tiny } } } as unknown as Record<string, Provider.Info>
    expect(AutoProvider.candidates(providers)).toEqual([])
  })
})
