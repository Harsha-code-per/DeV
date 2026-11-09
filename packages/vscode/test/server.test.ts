import { afterEach, expect, test } from "bun:test"

const { start } = require("../server.js")
const servers: { close(): void }[] = []
afterEach(() => servers.splice(0).forEach((server) => server.close()))

function connect(port: number, token: string) {
  const messages: any[] = []
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { "x-claude-code-ide-authorization": token } } as any)
  socket.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data))))
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve())
    socket.addEventListener("error", () => reject(new Error("refused")))
    socket.addEventListener("close", () => reject(new Error("closed")))
  })
  return { socket, messages, opened }
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await Bun.sleep(10)
  expect(check()).toBe(true)
}

test("DeV's handshake, then the selection made before it connected, then live mentions", async () => {
  const server = await start({ token: "t0k", name: "DeV Code for VS Code", version: "1.0.0" })
  servers.push(server)
  const selection = { text: "x", filePath: "/p/a.ts", selection: { start: { line: 3, character: 1 }, end: { line: 3, character: 2 } } }
  server.notify("selection_changed", selection)
  server.notify("at_mentioned", { filePath: "/p/a.ts", lineStart: 3, lineEnd: 5 })

  const client = connect(server.port, "t0k")
  await client.opened
  client.socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }))
  await until(() => client.messages.length >= 3)
  expect(client.messages[0]).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "DeV Code for VS Code", version: "1.0.0" } },
  })
  expect(client.messages[1]).toEqual({ jsonrpc: "2.0", method: "selection_changed", params: selection })
  expect(client.messages[2].method).toBe("at_mentioned")

  server.notify("at_mentioned", { filePath: "/p/b.ts", lineStart: 1, lineEnd: 1 })
  await until(() => client.messages.length === 4)
  expect(client.messages[3].params.filePath).toBe("/p/b.ts")
  expect(server.connected()).toBe(1)

  // A long message uses the 64-bit length form.
  server.notify("selection_changed", { ...selection, text: "y".repeat(70000) })
  await until(() => client.messages.length === 5)
  expect(client.messages[4].params.text.length).toBe(70000)
  client.socket.close()
})

test("a client without the token is turned away", async () => {
  const server = await start({ token: "right", name: "x", version: "1" })
  servers.push(server)
  const client = connect(server.port, "wrong")
  await expect(client.opened).rejects.toThrow()
  expect(server.connected()).toBe(0)
})
