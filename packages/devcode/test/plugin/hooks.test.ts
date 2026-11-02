import { expect, test } from "bun:test"
import path from "path"
import type { PluginInput } from "@dev-ai/plugin"
import { HooksPlugin } from "../../src/plugin/hooks"
import { tmpdir } from "../fixture/fixture"

async function load(dir: string, hooks: object) {
  const plugin = await HooksPlugin({ directory: dir, worktree: dir } as PluginInput)
  await plugin.config?.({ hooks } as never)
  return plugin
}

test("PreToolUse exit 2 blocks a matching tool and gets the call as JSON", async () => {
  await using dir = await tmpdir()
  const log = path.join(dir.path, "input.json")
  const plugin = await load(dir.path, {
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: `cat > ${log}; echo "no rm here" >&2; exit 2` }] },
    ],
  })
  const call = plugin["tool.execute.before"]!(
    { tool: "bash", sessionID: "s1", callID: "c1" },
    { args: { command: "rm -rf x" } },
  )
  expect(call).rejects.toThrow("Blocked by a PreToolUse hook: no rm here")
  await call.catch(() => {})
  expect(await Bun.file(log).json()).toMatchObject({
    hook_event_name: "PreToolUse",
    tool_name: "bash",
    tool_input: { command: "rm -rf x" },
    session_id: "s1",
  })
  // Other tools don't match.
  await plugin["tool.execute.before"]!({ tool: "edit", sessionID: "s1", callID: "c2" }, { args: {} })
})

test("PostToolUse exit 2 reports stderr to the agent; UserPromptSubmit stdout adds context", async () => {
  await using dir = await tmpdir()
  const plugin = await load(dir.path, {
    PostToolUse: [{ hooks: [{ type: "command", command: "echo 'lint failed' >&2; exit 2" }] }],
    UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo 'branch: main'" }] }],
  })
  const output = { title: "", output: "done", metadata: {} }
  await plugin["tool.execute.after"]!({ tool: "edit", sessionID: "s1", callID: "c1", args: {} }, output)
  expect(output.output).toBe("done\n\nPostToolUse hook:\nlint failed")

  const parts: { type: string; text?: string; synthetic?: boolean }[] = [{ type: "text", text: "fix it" }]
  await plugin["chat.message"]!({ sessionID: "s1" }, { message: { id: "m1", sessionID: "s1" }, parts } as never)
  expect(parts.at(-1)).toMatchObject({ type: "text", synthetic: true, text: "branch: main" })
})

test("Stop exit 2 keeps the main session working, a limited number of times", async () => {
  await using dir = await tmpdir()
  const plugin = await load(dir.path, {
    Stop: [{ hooks: [{ type: "command", command: "echo 'run the tests first' >&2; exit 2" }] }],
  })
  const stop = async (parentID?: string) => {
    const output: { continue?: string } = {}
    await plugin["experimental.session.stop"]!({ sessionID: "s1", parentID }, output)
    return output.continue
  }
  expect(await stop("parent")).toBeUndefined()
  expect(await stop()).toBe("Stop hook: run the tests first")
  expect(await stop()).toBe("Stop hook: run the tests first")
  expect(await stop()).toBe("Stop hook: run the tests first")
  // After three continuations in a row DeV stops anyway, so a hook can't loop forever.
  expect(await stop()).toBeUndefined()
})

test("SessionStart stdout is added to the session's first prompt", async () => {
  await using dir = await tmpdir()
  const plugin = await load(dir.path, {
    SessionStart: [{ hooks: [{ type: "command", command: "echo 'on branch main'" }] }],
  })
  void plugin.event!({ event: { type: "session.created", properties: { info: { id: "s1" } } } } as never)
  const first: { type: string; text?: string }[] = [{ type: "text", text: "hi" }]
  await plugin["chat.message"]!({ sessionID: "s1" }, { message: { id: "m1", sessionID: "s1" }, parts: first } as never)
  expect(first.at(-1)).toMatchObject({ synthetic: true, text: "on branch main" })
  const second: { type: string; text?: string }[] = [{ type: "text", text: "again" }]
  await plugin["chat.message"]!({ sessionID: "s1" }, { message: { id: "m2", sessionID: "s1" }, parts: second } as never)
  expect(second).toHaveLength(1)
})

test("an http hook gets the event as a JSON POST and can block like exit 2", async () => {
  await using dir = await tmpdir()
  const received: unknown[] = []
  using server = Bun.serve({
    port: 0,
    async fetch(request) {
      received.push(await request.json())
      return Response.json({ decision: "block", reason: "not on Fridays" })
    },
  })
  const plugin = await load(dir.path, {
    PreToolUse: [{ hooks: [{ type: "http", url: server.url.href, headers: { "X-Team": "dev" } }] }],
  })
  const call = plugin["tool.execute.before"]!({ tool: "bash", sessionID: "s1", callID: "c1" }, { args: { command: "deploy" } })
  expect(call).rejects.toThrow("Blocked by a PreToolUse hook: not on Fridays")
  await call.catch(() => {})
  expect(received[0]).toMatchObject({ hook_event_name: "PreToolUse", tool_name: "bash", tool_input: { command: "deploy" } })
})

test("PreCompact stdout joins the compaction instructions; FileChanged and Notification inform", async () => {
  await using dir = await tmpdir()
  const log = path.join(dir.path, "events.jsonl")
  const plugin = await load(dir.path, {
    PreCompact: [{ hooks: [{ type: "command", command: "echo 'keep the migration plan'" }] }],
    FileChanged: [{ hooks: [{ type: "command", command: `cat >> ${log}; echo >> ${log}` }] }],
    Notification: [{ hooks: [{ type: "command", command: `cat >> ${log}; echo >> ${log}` }] }],
  })
  const output = { context: [] as string[] }
  await plugin["experimental.session.compacting"]!({ sessionID: "s1" }, output)
  expect(output.context).toEqual(["keep the migration plan"])
  await plugin.event!({ event: { type: "file.edited", properties: { file: "/p/a.ts" } } as never })
  await plugin.event!({ event: { type: "permission.updated", properties: { sessionID: "s1", title: "bash: rm x" } } as never })
  const events = (await Bun.file(log).text()).trim().split("\n").map((line) => JSON.parse(line))
  expect(events).toMatchObject([
    { hook_event_name: "FileChanged", file_path: "/p/a.ts" },
    { hook_event_name: "Notification", message: "DeV needs your permission: bash: rm x", notification_type: "permission_prompt" },
  ])
})
