import { describe, expect, test } from "bun:test"
import type { ProviderListResponse } from "@dev-ai/sdk/v2/client"
import { directoryKey, normalizeProviderList } from "./utils"

describe("normalizeProviderList", () => {
  test("indexes providers and drops deprecated models", () => {
    const result = normalizeProviderList({
      all: [
        {
          id: "openai",
          name: "OpenAI",
          models: { "gpt-5": { id: "gpt-5", status: "active" }, "gpt-old": { id: "gpt-old", status: "deprecated" } },
        },
      ],
      connected: ["openai"],
      default: { openai: "gpt-5" },
    } as unknown as ProviderListResponse)

    expect(result.connected).toEqual(["openai"])
    expect(result.default).toEqual({ openai: "gpt-5" })
    expect(result.all.get("openai")?.models["gpt-old"]).toBeUndefined()
    expect(result.all.get("openai")?.models["gpt-5"]).toMatchObject({ id: "gpt-5" })
  })
})

describe("directoryKey", () => {
  test("normalizes slashes", () => {
    expect(String(directoryKey("C:\\Repos\\sst\\opencode"))).toBe("C:/Repos/sst/opencode")
    expect(String(directoryKey("C:/Repos/sst/opencode"))).toBe("C:/Repos/sst/opencode")
  })

  test("preserves backslashes in posix paths", () => {
    expect(String(directoryKey("/tmp/foo\\bar"))).toBe("/tmp/foo\\bar")
  })

  test("trims trailing slashes without breaking roots", () => {
    expect(String(directoryKey("C:/Repos/sst/opencode/"))).toBe("C:/Repos/sst/opencode")
    expect(String(directoryKey("C:/"))).toBe("C:/")
    expect(String(directoryKey("/"))).toBe("/")
  })
})
