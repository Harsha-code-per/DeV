// The local server DeV Code's TUI reads editor context from: JSON-RPC over a WebSocket, with your selection
// (selection_changed) and the lines you mention (at_mentioned). No dependencies: just enough of RFC 6455 for
// short text messages between two processes on this machine, and only for a client holding the token.
const http = require("node:http")
const crypto = require("node:crypto")

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

/** Starts the server on a free local port. Sends the latest selection, and a mention made before DeV connected, to each new client. */
function start(options) {
  const clients = new Set()
  const waiting = new Map()
  const server = http.createServer((_, response) => {
    response.writeHead(426)
    response.end()
  })

  server.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"]
    if (request.headers["x-claude-code-ide-authorization"] !== options.token || typeof key !== "string") {
      socket.destroy()
      return
    }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64")
    socket.write(
      ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"),
    )
    const client = { socket, buffer: Buffer.alloc(0) }
    clients.add(client)
    const drop = () => clients.delete(client)
    socket.on("close", drop)
    socket.on("error", drop)
    socket.on("data", (chunk) => {
      client.buffer = Buffer.concat([client.buffer, chunk])
      for (let frame = readFrame(client.buffer); frame; frame = readFrame(client.buffer)) {
        client.buffer = client.buffer.subarray(frame.length)
        if (frame.opcode === 8) return socket.end(encode(Buffer.alloc(0), 8))
        if (frame.opcode === 9) socket.write(encode(frame.payload, 10))
        if (frame.opcode === 1) answer(client, frame.payload.toString("utf8"))
      }
    })
  })

  function answer(client, text) {
    const message = parse(text)
    if (!message || (typeof message.id !== "number" && typeof message.id !== "string")) return
    const result =
      message.method === "initialize"
        ? {
            protocolVersion: message.params?.protocolVersion ?? "2025-11-25",
            capabilities: {},
            serverInfo: { name: options.name, version: options.version },
          }
        : {}
    client.socket.write(frameJson({ jsonrpc: "2.0", id: message.id, result }))
    if (message.method !== "initialize") return
    for (const [method, params] of waiting) client.socket.write(frameJson({ jsonrpc: "2.0", method, params }))
    waiting.delete("at_mentioned")
  }

  /** Sends to every connected DeV. The latest selection and an unsent mention are kept for the next one to connect. */
  function notify(method, params) {
    if (method === "selection_changed" || clients.size === 0) waiting.set(method, params)
    const data = frameJson({ jsonrpc: "2.0", method, params })
    for (const client of clients) client.socket.write(data)
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: server.address().port,
        notify,
        connected: () => clients.size,
        close() {
          for (const client of clients) client.socket.destroy()
          server.close()
        },
      }),
    )
  })
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function frameJson(value) {
  return encode(Buffer.from(JSON.stringify(value), "utf8"))
}

/** One unfragmented frame. Frames from a client are masked; the server's are not. */
function readFrame(buffer) {
  if (buffer.length < 2) return
  const opcode = buffer[0] & 0x0f
  const masked = (buffer[1] & 0x80) !== 0
  const short = buffer[1] & 0x7f
  const extra = short === 126 ? 2 : short === 127 ? 8 : 0
  if (buffer.length < 2 + extra) return
  const size = short === 126 ? buffer.readUInt16BE(2) : short === 127 ? Number(buffer.readBigUInt64BE(2)) : short
  const start = 2 + extra + (masked ? 4 : 0)
  if (buffer.length < start + size) return
  const payload = Buffer.from(buffer.subarray(start, start + size))
  if (masked) payload.forEach((byte, index) => (payload[index] = byte ^ buffer[2 + extra + (index % 4)]))
  return { opcode, payload, length: start + size }
}

function encode(payload, opcode = 1) {
  const size = payload.length
  if (size < 126) return Buffer.concat([Buffer.from([0x80 | opcode, size]), payload])
  if (size < 65536) return Buffer.concat([Buffer.from([0x80 | opcode, 126, size >> 8, size & 255]), payload])
  const head = Buffer.alloc(10)
  head[0] = 0x80 | opcode
  head[1] = 127
  head.writeBigUInt64BE(BigInt(size), 2)
  return Buffer.concat([head, payload])
}

module.exports = { start }
