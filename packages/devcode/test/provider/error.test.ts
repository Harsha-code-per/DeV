import { describe, expect, test } from "bun:test"
import { ProviderError } from "@/provider/error"
import { APICallError } from "ai"
import { ProviderV2 } from "@dev-ai/core/provider"

describe("provider stream errors", () => {
  test("retries provider stream errors without a code", () => {
    const messages = [
      "The model is currently at capacity due to high demand. Please try again in a few minutes, or use a higher service tier for priority processing: https://docs.x.ai/developers/advanced-api-usage/priority-processing",
      "The model is temporarily unavailable.",
    ]

    for (const message of messages)
      expect(
        ProviderError.parseStreamError({
          type: "error",
          error: { message },
        }),
      ).toEqual({
        type: "api_error",
        message,
        isRetryable: true,
        responseBody: JSON.stringify({ type: "error", error: { message } }),
      })
  })
})

describe("provider API errors", () => {
  test("a 413 over a per-minute token budget is not a context overflow", () => {
    const parsed = ProviderError.parseAPICallError({
      providerID: ProviderV2.ID.make("groq"),
      error: new APICallError({
        message: "Request too large for model `a` on tokens per minute (TPM): Limit 8000, Requested 18980",
        url: "https://example.com",
        requestBodyValues: {},
        statusCode: 413,
      }),
    })
    expect(parsed.type).toBe("api_error")
  })

  test("a 429 token throttle is a retryable rate limit, not a context overflow", () => {
    const body =
      '{"message":"Tokens per minute limit exceeded - too many tokens processed.","type":"too_many_tokens_error","code":"token_quota_exceeded"}'
    const parse = (statusCode: number) =>
      ProviderError.parseAPICallError({
        providerID: ProviderV2.ID.make("cerebras"),
        error: new APICallError({
          message: "Tokens per minute limit exceeded - too many tokens processed.",
          url: "https://api.cerebras.ai/v1/chat/completions",
          requestBodyValues: {},
          statusCode,
          responseBody: body,
          isRetryable: statusCode === 429,
        }),
      }).type
    expect(parse(429)).toBe("api_error")
    // The same wording on a 400 still means the request didn't fit.
    expect(parse(400)).toBe("context_overflow")
  })
})
