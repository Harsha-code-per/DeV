import { afterAll, describe, expect, test } from "bun:test"
import { LocalProviders } from "@/provider/local"

const server = Bun.serve({
  port: 0,
  fetch: (req) => {
    const path = new URL(req.url).pathname
    if (path === "/keyed/v1/models" && req.headers.get("authorization") !== "Bearer unified-key")
      return new Response("unauthorized", { status: 401 })
    if (path === "/v1/models" || path === "/keyed/v1/models")
      return Response.json({ data: [{ id: "qwen2.5-coder:7b" }, { id: "llama3.2:3b" }] })
    return new Response("not found", { status: 404 })
  },
})
afterAll(() => server.stop(true))

describe("LocalProviders.detect", () => {
  test("registers a running OpenAI-compatible server with all its models", async () => {
    const found = await LocalProviders.detect([
      { id: "ollama", name: "Ollama (local)", url: `http://127.0.0.1:${server.port}/v1` },
    ])
    expect(Object.keys(found)).toEqual(["ollama"])
    expect(found.ollama.options?.baseURL).toBe(`http://127.0.0.1:${server.port}/v1`)
    expect(Object.keys(found.ollama.models ?? {})).toEqual(["qwen2.5-coder:7b", "llama3.2:3b"])
  })

  test("a server that needs a key, like FreeLLMAPI, joins only with it", async () => {
    const url = `http://127.0.0.1:${server.port}/keyed/v1`
    expect(await LocalProviders.detect([{ id: "freellmapi", name: "FreeLLMAPI", url }])).toEqual({})
    const found = await LocalProviders.detect([{ id: "freellmapi", name: "FreeLLMAPI", url, apiKey: "unified-key" }])
    expect(found.freellmapi.options?.apiKey).toBe("unified-key")
    expect(Object.keys(found.freellmapi.models ?? {})).toHaveLength(2)
  })

  test("skips servers that are not running, quickly", async () => {
    const started = Date.now()
    const found = await LocalProviders.detect([
      { id: "lmstudio", name: "LM Studio (local)", url: "http://127.0.0.1:1/v1" },
    ])
    expect(found).toEqual({})
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
