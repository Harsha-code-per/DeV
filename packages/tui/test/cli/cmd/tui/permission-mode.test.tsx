/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ArgsProvider } from "../../../../src/context/args"
import { PermissionProvider, usePermission } from "../../../../src/context/permission"

async function mount(auto?: boolean) {
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
    <ArgsProvider auto={auto}>
      <PermissionProvider>
        <Probe />
      </PermissionProvider>
    </ArgsProvider>
  ))
  await ready
  return { app, permission }
}

const ask = (permission: string, command?: string) => ({ permission, patterns: [], metadata: command ? { command } : {} })

describe("permission modes", () => {
  test("default mode asks for everything", async () => {
    const { app, permission } = await mount()
    expect(permission.mode).toBe("normal")
    expect(permission.approves(ask("edit"))).toBe(false)
    expect(permission.approves(ask("bash"))).toBe(false)
    expect(permission.autoUnlocked).toBe(false)
    app.renderer.destroy()
  })

  test("accept edits approves file edits only", async () => {
    const { app, permission } = await mount()
    permission.set("edits")
    expect(permission.approves(ask("edit"))).toBe(true)
    expect(permission.approves(ask("bash"))).toBe(false)
    expect(permission.approves(ask("webfetch"))).toBe(false)
    expect(permission.approves(ask("external_directory"))).toBe(false)
    app.renderer.destroy()
  })

  test("auto approves everything and is unlocked by the launch flag", async () => {
    const { app, permission } = await mount(true)
    expect(permission.mode).toBe("auto")
    expect(permission.autoUnlocked).toBe(true)
    expect(permission.approves(ask("bash"))).toBe(true)
    expect(permission.approves(ask("external_directory"))).toBe(true)
    app.renderer.destroy()
  })

  test("opting into auto once keeps it in the cycle after leaving it", async () => {
    const { app, permission } = await mount()
    permission.toggle()
    expect(permission.mode).toBe("auto")
    permission.set("normal")
    expect(permission.autoUnlocked).toBe(true)
    app.renderer.destroy()
  })
})
