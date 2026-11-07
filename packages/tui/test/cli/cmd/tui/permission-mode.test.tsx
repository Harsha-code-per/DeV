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
    // Leaving the sandbox is not risky in itself: reading the person's repos with their gh login goes ahead.
    expect(
      permission.decide({ ...ask("bash", "gh repo list --limit 500"), metadata: { command: "gh repo list", sandbox: "escape" } }),
    ).toEqual({ reply: "once" })
    expect(permission.decide(ask("external_directory"))).toEqual({ reply: "once" })
    const risky = permission.decide(ask("bash", "git push --force"))
    expect(risky?.reply).toBe("reject")
    expect(risky && "message" in risky ? risky.message : "").toContain("rewrites shared git history")
    app.renderer.destroy()
  })

  test("auto asks the person when DeV repeats a refused request, since it really needs it", async () => {
    const { app, permission } = await mount(true)
    const list = ask("bash", "git push --force origin main")
    expect(permission.decide(list)?.reply).toBe("reject")
    expect(permission.decide(list)).toBeUndefined()
    expect(permission.decide(list)).toBeUndefined()
    // Another session has refused nothing yet.
    expect(permission.decide({ ...list, sessionID: "ses_2" })?.reply).toBe("reject")
    app.renderer.destroy()
  })

  test("auto asks the person after 3 different refusals in a row instead of looping", async () => {
    const { app, permission } = await mount(true)
    const replies = ["a", "b", "c"].map((branch) => permission.decide(ask("bash", `git push --force origin ${branch}`))?.reply)
    expect(replies).toEqual(["reject", "reject", "reject"])
    expect(permission.decide(ask("bash", "git push --force origin d"))).toBeUndefined()
    expect(permission.decide(ask("bash", "git push --force origin e"))?.reply).toBe("reject")
    app.renderer.destroy()
  })

  test("auto asks after 20 refusals in a session even with approvals between them", async () => {
    const { app, permission } = await mount(true)
    const replies = Array.from({ length: 20 }, (_, i) => {
      const reply = permission.decide(ask("bash", `git push --force origin b${i}`))?.reply
      if (i % 2 === 1) permission.decide(ask("bash", "ls"))
      return reply
    })
    expect(replies.every((reply) => reply === "reject")).toBe(true)
    expect(permission.decide(ask("bash", "git push --force origin last"))).toBeUndefined()
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
    expect(permission.refused.map((item) => item.patterns[0])).toEqual(["npm publish", "git push --force"])
    expect(permission.refused[1]?.always).toEqual(["git *"])
    permission.forget(permission.refused[1]!)
    expect(permission.refused.map((item) => item.patterns[0])).toEqual(["npm publish"])
    app.renderer.destroy()
  })
})
