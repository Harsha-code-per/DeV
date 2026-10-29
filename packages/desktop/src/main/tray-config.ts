import { Option, Schema } from "effect"

export const DEFAULT_QUICK_PROMPT_HOTKEY = "CommandOrControl+Shift+Space"

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export function quickPromptHotkey(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_QUICK_PROMPT_HOTKEY
  return value.trim()
}

// The renderer persists its server state (JSON) in the global store; quick prompts and
// tray sessions open in the last project used on the local server, else the home folder.
export function quickPromptDirectory(server: unknown, home: string) {
  const state = (typeof server === "string" ? Option.getOrUndefined(decodeJson(server)) : server) as
    | { lastProject?: { local?: unknown } }
    | null
    | undefined
  const last = state?.lastProject?.local
  return typeof last === "string" && last ? last : home
}

export function newSessionLink(directory: string, prompt?: string) {
  const url = new URL("devai://new-session")
  url.searchParams.set("directory", directory)
  if (prompt) url.searchParams.set("prompt", prompt)
  return url.toString()
}

export function autostartEntry(name: string, command: string[]) {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${name}`,
    `Exec=${command.map(execArg).join(" ")}`,
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n")
}

// Desktop Entry spec: inside a quoted argument `"`, backquote, `$` and `\` take a backslash,
// then the string-value escaping doubles every backslash again, and `%` starts a field code.
function execArg(arg: string) {
  return `"${arg
    .replace(/["`$\\]/g, "\\$&")
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "%%")}"`
}

export function quickPromptPage(placeholder: string) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
:root { color-scheme: light dark; }
html, body { margin: 0; height: 100%; overflow: hidden; background: Canvas; }
input { box-sizing: border-box; width: 100%; height: 100%; padding: 0 18px; border: 2px solid #F2A516; outline: none;
  background: Canvas; color: CanvasText; caret-color: #F2A516; font: 18px system-ui, sans-serif; }
</style>
</head>
<body>
<input autofocus spellcheck="false" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}">
<script>
const input = document.querySelector("input")
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) window.api.submitQuickPrompt(input.value)
  if (event.key === "Escape") window.api.submitQuickPrompt("")
})
</script>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`)
}
