/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ArgsProvider } from "../../../../src/context/args"
import { PermissionProvider, usePermission } from "../../../../src/context/permission"

async function mount(auto?: boolean, goal?: boolean) {
  let permission!: ReturnType<typeof usePermission>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })
  function Probe() {
    const ctx = usePermission()
    onMount(() => {
      permission = ctx
      done()
    })
    return <box />
  }
  const app = await testRender(() => (
    <ArgsProvider auto={auto} goal={goal}>
      <PermissionProvider>
        <Probe />
      </PermissionProvider>
    </ArgsProvider>
  ))
  await ready
  return { app, permission }
}

const ask = (permission: string, command?: string) => ({
  sessionID: "ses_1",
  permission,
  patterns: command ? [command] : [],
  always: command ? [command.split(" ")[0] + " *"] : [],
  metadata: command ? { command } : {},
})

describe("permission modes", () => {
  test("default mode asks for everything", async () => {
    const { app, permission } = await mount()
    expect(permission.mode).toBe("normal")
    expect(permission.decide(ask("edit"))).toBeUndefined()
    expect(permission.decide(ask("bash", "ls"))).toBeUndefined()
    app.renderer.destroy()
  })

  test("accept edits approves file edits only", async () => {
    const { app, permission } = await mount()
    permission.set("edits")
    expect(permission.decide(ask("edit"))).toEqual({ reply: "once" })
    expect(permission.decide(ask("bash", "ls"))).toBeUndefined()
    expect(permission.decide(ask("webfetch"))).toBeUndefined()
    expect(permission.decide(ask("external_directory"))).toBeUndefined()
    app.renderer.destroy()
  })

  test("auto never asks: safe requests go ahead, risky ones are refused with the reason", async () => {
    const { app, permission } = await mount(true)
    expect(permission.mode).toBe("auto")
    expect(permission.decide(ask("bash", "bun test"))).toEqual({ reply: "once" })
    expect(permission.decide(ask("external_directory"))).toEqual({ reply: "once" })
    const risky = permission.decide(ask("bash", "git push --force"))
    expect(risky?.reply).toBe("reject")
    expect(risky && "message" in risky ? risky.message : "").toContain("rewrites shared git history")
    app.renderer.destroy()
  })

  test("auto asks the person after repeated refusals instead of looping", async () => {
    const { app, permission } = await mount(true)
    const push = ask("bash", "git push --force")
    expect([1, 2, 3].map(() => permission.decide(push)?.reply)).toEqual(["reject", "reject", "reject"])
    expect(permission.decide(push)).toBeUndefined()
    expect(permission.decide(push)?.reply).toBe("reject")
    app.renderer.destroy()
  })

  test("auto asks after 20 refusals in a session even with approvals between them", async () => {
    const { app, permission } = await mount(true)
    const push = ask("bash", "git push --force")
    const replies = Array.from({ length: 20 }, (_, i) => {
      const reply = permission.decide(push)?.reply
      if (i % 2 === 1) permission.decide(ask("bash", "ls"))
      return reply
    })
    expect(replies.every((reply) => reply === "reject")).toBe(true)
    expect(permission.decide(push)).toBeUndefined()
    app.renderer.destroy()
  })

  test("goal mode approves like auto and starts from the launch flag", async () => {
    const { app, permission } = await mount(false, true)
    expect(permission.mode).toBe("goal")
    expect(permission.decide(ask("edit"))).toEqual({ reply: "once" })
    expect(permission.decide(ask("bash", "sudo rm -rf /"))?.reply).toBe("reject")
    app.renderer.destroy()
  })

  test("auto keeps a list of what it refused for /permissions, newest first and without repeats", async () => {
    const { app, permission } = await mount(true)
    permission.decide(ask("bash", "git push --force"))
    permission.decide(ask("bash", "npm publish"))
    permission.decide(ask("bash", "git push --force"))
    permission.decide(ask("bash", "ls"))
    expect(permission.refused.map((item) => item.patterns[0])).toEqual(["git push --force", "npm publish"])
    expect(permission.refused[0]?.always).toEqual(["git *"])
    permission.forget(permission.refused[0]!)
    expect(permission.refused.map((item) => item.patterns[0])).toEqual(["npm publish"])
    app.renderer.destroy()
  })
})
