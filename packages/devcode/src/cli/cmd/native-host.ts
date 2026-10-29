import fs from "fs/promises"
import { existsSync } from "fs"
import os from "os"
import path from "path"
import { Option, Schema } from "effect"
import { Global } from "@dev-ai/core/global"
import { ServerAuth } from "@/server/auth"
import { UI } from "../ui"
import { cmd } from "./cmd"

// DeV for Chrome talks to DeV through Chrome's native messaging: Chrome starts this command and
// exchanges length-prefixed JSON on stdin/stdout. Requests are answered by the server in-process, so
// no port is opened. Only the few calls the side panel needs are allowed (see `route`).

export const HOST = "dev.devcode"

// Chrome disconnects a host that sends a message over 1 MB.
const MAX_REPLY = 1024 * 1024

// Forced onto every session the host creates: page text is untrusted, and nobody is at a terminal
// to answer permission prompts, so the extension gets a chat with no tools.
const NO_TOOLS = [{ permission: "*", pattern: "*", action: "deny" }]

const HostRequest = Schema.Struct({
  id: Schema.Number,
  method: Schema.String,
  path: Schema.String,
  body: Schema.optional(Schema.Unknown),
})
type HostRequest = typeof HostRequest.Type

// Decoding drops unknown keys, so a prompt can't carry `tools`, `agent` or `system` overrides.
const CreateBody = Schema.Struct({ title: Schema.optional(Schema.String) })
const PromptBody = Schema.Struct({
  parts: Schema.NonEmptyArray(
    Schema.Struct({ type: Schema.Literal("text"), text: Schema.String, synthetic: Schema.optional(Schema.Boolean) }),
  ),
})

export const NativeHostCommand = cmd({
  command: "native-host [origin]",
  describe: "native messaging host for DeV for Chrome",
  builder: (yargs) =>
    yargs
      .positional("origin", { type: "string", describe: "extension origin, passed by the browser" })
      .option("install", { type: "boolean", describe: "register the host with Chrome, Chromium, Edge and Brave" })
      .option("extension-id", { type: "string", describe: "the extension id shown in chrome://extensions" })
      // Chrome on Windows passes the calling window's handle.
      .option("parent-window", { type: "number", hidden: true }),
  async handler(args) {
    if (args.install) return install(args.extensionId)
    // A stray console.log would corrupt the framing, so stdout is pointed at stderr and frames go
    // to Bun.stdout directly.
    process.stdout.write = process.stderr.write.bind(process.stderr)
    console.log = console.error
    const { Server } = await import("@/server/server")
    // An empty directory of its own: the sessions have no tools, and loading a project at $HOME
    // would start watchers over the whole home directory.
    const directory = path.join(Global.Path.data, "chrome", "workspace")
    await fs.mkdir(directory, { recursive: true })
    const owned = new Set<string>()
    const forward = async (request: HostRequest) => {
      const target = route(request, owned)
      if (!target) return reply(request.id, 403, { error: `not allowed: ${request.method} ${request.path}` })
      const url = new URL(target.path, "http://dev.internal")
      url.searchParams.set("directory", directory)
      const headers = new Headers({ "content-type": "application/json" })
      const auth = ServerAuth.header()
      if (auth) headers.set("Authorization", auth)
      const response = await Server.Default().app.fetch(
        new Request(url, {
          method: target.method,
          headers,
          body: target.body === undefined ? undefined : JSON.stringify(target.body),
        }),
      )
      const text = await response.text()
      const body: unknown = text ? JSON.parse(text) : null
      if (response.ok && target.path === "/session") owned.add(String((body as { id: unknown }).id))
      return reply(request.id, response.status, body)
    }
    // Requests run concurrently (a prompt waits for the whole reply, an abort must not wait behind
    // it); writes are chained so replies never interleave.
    let queue = Promise.resolve()
    const send = (frame: Buffer) => {
      queue = queue.then(() => Bun.write(Bun.stdout, frame).then(() => {}))
      return queue
    }
    const replies: Promise<void>[] = []
    for await (const message of frames(process.stdin)) {
      const request = Schema.decodeUnknownOption(HostRequest)(message)
      replies.push(
        Option.isNone(request)
          ? send(reply(null, 400, { error: "malformed request" }))
          : forward(request.value)
              .catch((error) => reply(request.value.id, 500, { error: String(error) }))
              .then(send),
      )
    }
    // Piped input ends before the replies are ready; finish them before exiting.
    await Promise.all(replies)
  },
})

// The allowlist: create a session, prompt it, read its messages, abort it — and only for sessions
// this host created, so the extension can't reach the user's other sessions or any other API.
// Returns the request to forward, rebuilt from validated fields, or undefined when not allowed.
export function route(request: HostRequest, owned: Set<string>) {
  if (request.method === "POST" && request.path === "/session") {
    const body = Schema.decodeUnknownOption(CreateBody)(request.body ?? {})
    if (Option.isNone(body)) return
    return { method: "POST", path: "/session", body: { title: body.value.title, permission: NO_TOOLS } }
  }
  const match = /^\/session\/([^/?#]+)\/(message|abort)$/.exec(request.path)
  if (!match || !owned.has(match[1])) return
  if (match[2] === "abort") return request.method === "POST" ? { method: "POST", path: request.path } : undefined
  if (request.method === "GET") return { method: "GET", path: `${request.path}?limit=20` }
  if (request.method !== "POST") return
  const body = Schema.decodeUnknownOption(PromptBody)(request.body)
  if (Option.isNone(body)) return
  return { method: "POST", path: request.path, body: body.value }
}

export function encode(message: unknown) {
  const body = Buffer.from(JSON.stringify(message))
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length)
  return Buffer.concat([head, body])
}

export async function* frames(input: AsyncIterable<Uint8Array>) {
  let buffer = Buffer.alloc(0)
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, chunk])
    while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
      const end = 4 + buffer.readUInt32LE(0)
      yield JSON.parse(buffer.subarray(4, end).toString("utf8")) as unknown
      buffer = buffer.subarray(end)
    }
  }
}

// Encodes a reply, replacing one Chrome would reject for size with an error.
function reply(id: number | null, status: number, body: unknown) {
  const frame = encode({ id, status, body })
  if (frame.length <= MAX_REPLY + 4) return frame
  return encode({ id, status: 413, body: { error: "reply is over Chrome's 1 MB limit" } })
}

async function install(extensionId: string | undefined) {
  if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
    UI.error("--install needs --extension-id <id>: the 32-letter id under DeV for Chrome in chrome://extensions")
    process.exitCode = 1
    return
  }
  const windows = process.platform === "win32"
  const dir = path.join(Global.Path.data, "chrome")
  const launcher = path.join(dir, windows ? "native-host.bat" : "native-host.sh")
  // From source (`bun run src/index.ts`) the launcher needs the script too; a compiled binary
  // reports a virtual $bunfs / ~BUN path instead.
  const script = process.argv[1] ?? ""
  const command = [
    process.execPath,
    ...(/\.[cm]?[jt]sx?$/.test(script) && !/\$bunfs|~BUN/.test(script) ? [path.resolve(script)] : []),
    "native-host",
  ]
  await Bun.write(
    launcher,
    windows
      ? `@echo off\r\n${command.map((part) => `"${part}"`).join(" ")} %*\r\n`
      : `#!/bin/sh\nexec ${command.map((part) => `'${part.replaceAll("'", `'\\''`)}'`).join(" ")} "$@"\n`,
  )
  await fs.chmod(launcher, 0o755)
  const manifest = JSON.stringify(
    {
      name: HOST,
      description: "DeV for Chrome",
      path: launcher,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`],
    },
    null,
    2,
  )
  if (windows) {
    const file = path.join(dir, `${HOST}.json`)
    await Bun.write(file, manifest)
    UI.println(`Wrote ${file}. Register it for your browser in a terminal:`)
    for (const key of ["Google\\Chrome", "Chromium", "Microsoft\\Edge", "BraveSoftware\\Brave-Browser"])
      UI.println(`  reg add "HKCU\\Software\\${key}\\NativeMessagingHosts\\${HOST}" /ve /t REG_SZ /d "${file}" /f`)
    return
  }
  const base =
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".config")
  const browsers = (
    process.platform === "darwin"
      ? ["Google/Chrome", "Chromium", "Microsoft Edge", "BraveSoftware/Brave-Browser"]
      : ["google-chrome", "chromium", "microsoft-edge", "BraveSoftware/Brave-Browser"]
  )
    .map((browser) => path.join(base, browser))
    .filter((root) => existsSync(root))
  if (browsers.length === 0) {
    UI.error(`No Chrome, Chromium, Edge or Brave profile found under ${base}`)
    process.exitCode = 1
    return
  }
  for (const root of browsers) {
    const file = path.join(root, "NativeMessagingHosts", `${HOST}.json`)
    await Bun.write(file, manifest)
    UI.println(`Registered ${file}`)
  }
}
