/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup, onMount } from "solid-js"
import { tmpdir } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"

// What's new after an update can be dozens of lines; the ok button must stay on an 80x24 screen.
test("a long alert scrolls inside the screen and keeps its ok button visible", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const [
    { DialogProvider, useDialog },
    { DialogAlert },
    { KVProvider },
    { ThemeProvider },
    { TuiConfigProvider },
    { ToastProvider },
    { DevcodeKeymapProvider, registerDevcodeKeymap },
  ] = await Promise.all([
    import("../../../src/ui/dialog"),
    import("../../../src/ui/dialog-alert"),
    import("../../../src/context/kv"),
    import("../../../src/context/theme"),
    import("../../../src/config"),
    import("../../../src/ui/toast"),
    import("../../../src/keymap"),
  ])
  const message = Array.from({ length: 60 }, (_, i) => `• change number ${i + 1}`).join("\n")

  function Open() {
    const dialog = useDialog()
    onMount(() => dialog.replace(() => <DialogAlert title="What's new" message={message} />))
    return <box />
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({ leader_timeout: 1000 })
    onCleanup(registerDevcodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <DevcodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <DialogProvider>
                    <Open />
                  </DialogProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </DevcodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 80, height: 24 })
  try {
    const frame = async () => {
      await app.renderOnce()
      return app.captureCharFrame()
    }
    let screen = ""
    for (let i = 0; i < 50 && !/change number 1 /.test(screen); i++) {
      await Bun.sleep(10)
      screen = await frame()
    }
    expect(screen).toMatch(/change number 1 /)
    expect(screen).toContain("What's new")
    expect(screen).toMatch(/\bok\b/)
    expect(screen).not.toContain("change number 60")
    app.mockInput.pressArrow("down")
    expect(await frame()).not.toMatch(/change number 1 /)
    // Page Down
    for (let i = 0; i < 6; i++) app.mockInput.pressKey("\u001b[6~")
    screen = await frame()
    expect(screen).toContain("change number 60")
    expect(screen).toMatch(/\bok\b/)
  } finally {
    app.renderer.destroy()
  }
})
