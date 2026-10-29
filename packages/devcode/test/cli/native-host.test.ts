import { describe, expect, test } from "bun:test"
import { PassThrough } from "stream"
import { encode, frames, route } from "../../src/cli/cmd/native-host"

describe("native messaging framing", () => {
  test("decodes frames split across and packed into chunks", async () => {
    const stream = new PassThrough()
    const bytes = Buffer.concat([encode({ id: 1, text: "héllo" }), encode({ id: 2 }), encode({ id: 3 })])
    expect(bytes.readUInt32LE(0)).toBe(Buffer.byteLength(JSON.stringify({ id: 1, text: "héllo" })))
    // The first length prefix itself is split, then two whole frames arrive in one chunk.
    stream.write(bytes.subarray(0, 2))
    stream.write(bytes.subarray(2, 9))
    stream.end(bytes.subarray(9))
    const out = []
    for await (const message of frames(stream)) out.push(message)
    expect(out).toEqual([{ id: 1, text: "héllo" }, { id: 2 }, { id: 3 }])
  })
})

describe("native host allowlist", () => {
  const owned = new Set(["ses_mine"])

  test("creating a session forces the no-tools permission and drops other fields", () => {
    expect(
      route({ id: 1, method: "POST", path: "/session", body: { title: "t", permission: [], agent: "build" } }, owned),
    ).toEqual({
      method: "POST",
      path: "/session",
      body: { title: "t", permission: [{ permission: "*", pattern: "*", action: "deny" }] },
    })
  })

  test("prompts keep only text parts", () => {
    expect(
      route(
        {
          id: 1,
          method: "POST",
          path: "/session/ses_mine/message",
          body: { parts: [{ type: "text", text: "hi", synthetic: true }], tools: { bash: true }, system: "x" },
        },
        owned,
      ),
    ).toEqual({ method: "POST", path: "/session/ses_mine/message", body: { parts: [{ type: "text", text: "hi", synthetic: true }] } })
    expect(
      route({ id: 1, method: "POST", path: "/session/ses_mine/message", body: { parts: [{ type: "file", url: "x" }] } }, owned),
    ).toBeUndefined()
    expect(route({ id: 1, method: "POST", path: "/session/ses_mine/message", body: { parts: [] } }, owned)).toBeUndefined()
  })

  test("reads and aborts only sessions the host created", () => {
    expect(route({ id: 1, method: "GET", path: "/session/ses_mine/message" }, owned)).toEqual({
      method: "GET",
      path: "/session/ses_mine/message?limit=20",
    })
    expect(route({ id: 1, method: "POST", path: "/session/ses_mine/abort" }, owned)).toEqual({
      method: "POST",
      path: "/session/ses_mine/abort",
    })
    expect(route({ id: 1, method: "GET", path: "/session/ses_other/message" }, owned)).toBeUndefined()
    expect(route({ id: 1, method: "GET", path: "/session/ses_mine/abort" }, owned)).toBeUndefined()
  })

  test("everything else is refused", () => {
    for (const [method, path] of [
      ["GET", "/session"],
      ["GET", "/config"],
      ["POST", "/session/ses_mine/shell"],
      ["DELETE", "/session/ses_mine"],
      ["POST", "/session/ses_mine/permissions/per_1"],
      ["GET", "/session/ses_mine/message?limit=1000"],
      ["GET", "/session/ses_mine/message/../../config"],
    ])
      expect(route({ id: 1, method, path }, owned)).toBeUndefined()
  })
})
