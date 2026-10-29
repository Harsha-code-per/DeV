import { describe, expect, test } from "bun:test"
import { parseNewSessionDeepLink } from "../../../app/src/pages/layout/deep-links"
import {
  autostartEntry,
  DEFAULT_QUICK_PROMPT_HOTKEY,
  newSessionLink,
  quickPromptDirectory,
  quickPromptHotkey,
  quickPromptPage,
} from "./tray-config"

describe("tray config", () => {
  test("hotkey falls back to the default unless a non-empty accelerator is configured", () => {
    expect(quickPromptHotkey(undefined)).toBe(DEFAULT_QUICK_PROMPT_HOTKEY)
    expect(quickPromptHotkey("  ")).toBe(DEFAULT_QUICK_PROMPT_HOTKEY)
    expect(quickPromptHotkey(42)).toBe(DEFAULT_QUICK_PROMPT_HOTKEY)
    expect(quickPromptHotkey(" Alt+Space ")).toBe("Alt+Space")
  })

  test("quick prompts open in the last local project, else home", () => {
    const state = { lastProject: { local: "/work/app", "http://remote": "/x" } }
    expect(quickPromptDirectory(JSON.stringify(state), "/home/me")).toBe("/work/app")
    expect(quickPromptDirectory(state, "/home/me")).toBe("/work/app")
    expect(quickPromptDirectory("{not json", "/home/me")).toBe("/home/me")
    expect(quickPromptDirectory(null, "/home/me")).toBe("/home/me")
    expect(quickPromptDirectory(JSON.stringify({ lastProject: { local: 3 } }), "/home/me")).toBe("/home/me")
  })

  test("new session links round-trip through the app's deep link parser", () => {
    const prompt = "fix the build & run tests?"
    expect(parseNewSessionDeepLink(newSessionLink("/a b/c", prompt))).toEqual({ directory: "/a b/c", prompt })
    expect(parseNewSessionDeepLink(newSessionLink("/a"))).toEqual({ directory: "/a" })
  })

  test("autostart entry quotes and escapes the command", () => {
    expect(autostartEntry("DeV", ["/opt/De V/dev", "--hidden"])).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=DeV",
        'Exec="/opt/De V/dev" "--hidden"',
        "X-GNOME-Autostart-enabled=true",
        "",
      ].join("\n"),
    )
    expect(autostartEntry("DeV", ['/a"$`\\%b'])).toContain('Exec="/a\\\\"\\\\$\\\\`\\\\\\\\%%b"')
  })

  test("quick prompt page escapes its placeholder", () => {
    const page = quickPromptPage('Ask "DeV" <now> & go')
    expect(page).toContain('placeholder="Ask &#34;DeV&#34; &#60;now&#62; &#38; go"')
    expect(page).not.toContain("<now>")
  })
})
