import { Effect, Schedule, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Parser } from "htmlparser2"
import * as Tool from "./tool"
import TurndownService from "turndown"
import DESCRIPTION from "./webfetch.txt"
import { isImageAttachment } from "@/util/media"
import { Untrusted } from "@/util/untrusted"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "The URL to fetch content from" }),
  format: Schema.Literals(["text", "markdown", "html"])
    .annotate({
      description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
      default: "markdown",
    })
    .pipe(Schema.withDecodingDefault(Effect.succeed("markdown" as const))),
  timeout: Schema.optional(Schema.Number).annotate({ description: "Optional timeout in seconds (max 120)" }),
})

export const WebFetchTool = Tool.define(
  "webfetch",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    // A lookup or connection that fails once (flaky DNS or Wi-Fi) is tried again before the page is called
    // unreachable, as are 429 and 5xx answers.
    const httpOk = HttpClient.filterStatusOk(http).pipe(
      HttpClient.retryTransient({ retryOn: "errors-only", times: 2, schedule: Schedule.spaced("1 second") }),
    )

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
            throw new Error("URL must start with http:// or https://")
          }

          yield* ctx.ask({
            permission: "webfetch",
            patterns: [params.url],
            always: ["*"],
            metadata: {
              url: params.url,
              format: params.format,
              timeout: params.timeout,
            },
          })

          const timeout = Math.min((params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT)

          // Build Accept header based on requested format with q parameters for fallbacks
          let acceptHeader = "*/*"
          switch (params.format) {
            case "markdown":
              acceptHeader = "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
              break
            case "text":
              acceptHeader = "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
              break
            case "html":
              acceptHeader =
                "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
              break
            default:
              acceptHeader =
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
          }
          const headers = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: acceptHeader,
            "Accept-Language": "en-US,en;q=0.9",
          }

          const request = HttpClientRequest.get(params.url).pipe(HttpClientRequest.setHeaders(headers))

          // Retry with honest UA if blocked by Cloudflare bot detection (TLS fingerprint mismatch)
          const response = yield* httpOk.execute(request).pipe(
            Effect.catchIf(
              (err) =>
                err.reason._tag === "StatusCodeError" &&
                err.reason.response.status === 403 &&
                err.reason.response.headers["cf-mitigated"] === "challenge",
              () =>
                httpOk.execute(
                  HttpClientRequest.get(params.url).pipe(
                    HttpClientRequest.setHeaders({ ...headers, "User-Agent": "devcode" }),
                  ),
                ),
            ),
            Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.die(new Error("Request timed out")) }),
          )

          // Check content length
          const contentLength = response.headers["content-length"]
          if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
            throw new Error("Response too large (exceeds 5MB limit)")
          }

          const arrayBuffer = yield* response.arrayBuffer
          if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
            throw new Error("Response too large (exceeds 5MB limit)")
          }

          const contentType = response.headers["content-type"] || ""
          const mime = contentType.split(";")[0]?.trim().toLowerCase() || ""
          const title = `${params.url} (${contentType})`

          if (isImageAttachment(mime)) {
            const base64Content = Buffer.from(arrayBuffer).toString("base64")
            return {
              title,
              output: "Image fetched successfully",
              metadata: {},
              attachments: [
                {
                  type: "file" as const,
                  mime,
                  url: `data:${mime};base64,${base64Content}`,
                },
              ],
            }
          }

          const content = new TextDecoder().decode(arrayBuffer)

          const output = !contentType.includes("text/html")
            ? content
            : params.format === "markdown"
              ? convertHTMLToMarkdown(content)
              : params.format === "text"
                ? extractTextFromHTML(content)
                : content
          // Sites built as JavaScript apps (Unstop, Hack2skill, many listings) send a shell with almost
          // no text; a reader that loads the page in a browser gets what a person would see.
          const rendered =
            contentType.includes("text/html") && params.format !== "html" && needsBrowser(params.url, content)
              ? yield* renderInBrowser(httpOk, params.url)
              : undefined
          return {
            output: Untrusted.wrap(params.url, rendered ?? output),
            title: rendered ? `${params.url} (rendered in a browser)` : title,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)

const MIN_WORDS = 150
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

// A JavaScript app's shell: little text but scripts that would draw the page. The reader cannot reach
// this computer or a private network, so those addresses keep the plain fetch.
function needsBrowser(url: string, html: string) {
  const host = URL.parse(url)?.hostname ?? ""
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)|\.local$/.test(host)) return false
  return /<script\b/i.test(html) && wordCount(extractTextFromHTML(html)) < MIN_WORDS
}

// r.jina.ai renders a public page in a browser and returns it as Markdown; free without a key. Only the
// page address is sent. Undefined when it fails or finds no more than the plain fetch did.
const renderInBrowser = (http: HttpClient.HttpClient, url: string) =>
  Effect.gen(function* () {
    const response = yield* http.execute(
      HttpClientRequest.get(`https://r.jina.ai/${url}`).pipe(
        HttpClientRequest.setHeaders({ "X-Return-Format": "markdown", "User-Agent": "devcode" }),
      ),
    )
    const text = yield* response.text
    return wordCount(text) > MIN_WORDS ? text : undefined
  }).pipe(
    Effect.timeoutOrElse({ duration: "25 seconds", orElse: () => Effect.succeed(undefined) }),
    Effect.orElseSucceed(() => undefined),
  )

function extractTextFromHTML(html: string) {
  let text = ""
  let skipDepth = 0

  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)) {
        skipDepth++
      }
    },
    ontext(input) {
      if (skipDepth === 0) text += input
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--
    },
  })

  parser.write(html)
  parser.end()

  return text.trim()
}

function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndownService.remove(["script", "style", "meta", "link"])
  return turndownService.turndown(html)
}
