import path from "path"
import { Global } from "@dev-ai/core/global"

// Output styles, as in Claude Code: `output_style` in dev.json changes how the agent writes and explains,
// on top of its normal instructions. Built-ins below; a custom style is `output-styles/<name>.md` in the
// project's .dev folder or in ~/.config/dev.

const BUILT_IN: Record<string, string> = {
  explanatory: [
    "Output style: explanatory.",
    "While you work, briefly explain the choices you make and why: the design of the code you write, trade-offs you considered,",
    "and anything about this codebase worth knowing. Keep each explanation short and next to the change it explains.",
  ].join("\n"),
  learning: [
    "Output style: learning.",
    "The user wants to learn by doing. For small, meaningful pieces (a function body, a condition, a test case), leave a",
    "clearly marked `TODO(human)` with what to write and a hint, and ask the user to fill it in instead of writing it yourself.",
    "Do the boilerplate and the risky parts yourself. Explain concepts briefly as they come up.",
  ].join("\n"),
  concise: [
    "Output style: concise.",
    "Keep replies as short as possible: lead with the result, skip preamble and recaps, and use bullets only when they help.",
  ].join("\n"),
}

/** The instruction for the configured style, or undefined for the default style. */
export async function text(name: string | undefined, projectDir: string) {
  if (!name || name === "default") return undefined
  if (BUILT_IN[name]) return BUILT_IN[name]
  const files = [
    path.join(projectDir, ".dev", "output-styles", `${name}.md`),
    path.join(Global.Path.config, "output-styles", `${name}.md`),
  ]
  const found = await Promise.all(
    files.map((file) =>
      Bun.file(file)
        .text()
        .catch(() => undefined),
    ),
  )
  const custom = found.find((content) => content !== undefined)
  return custom ? `Output style: ${name}.\n${custom.trim()}` : undefined
}

export const names = Object.keys(BUILT_IN)

export * as OutputStyle from "./output-style"
