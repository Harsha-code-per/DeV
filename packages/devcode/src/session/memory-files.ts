// Two ways to organise project memory:
// - `@path` lines in DEV.md (or AGENTS.md, CLAUDE.md, a rule) pull another file in, relative to the file
//   that names it, up to four levels deep.
// - Rule files in .dev/rules/ (or .claude/rules/): without `paths:` frontmatter they load every
//   session; with it, only once DeV reads a file that matches one of the patterns.
import fs from "fs"
import path from "path"
import { ConfigMarkdown } from "@dev-ai/core/config/markdown"

const MAX_DEPTH = 4
const IMPORT = /^\s*@((?:~\/|\.{1,2}\/|\/)?[\w.@~/-]+\.[\w]+)\s*$/

/** `content` with every `@path` line outside code blocks replaced by that file's own content. */
export function expandImports(content: string, file: string, home: string, depth = 0, seen = new Set([file])): string {
  if (depth >= MAX_DEPTH) return content
  let fenced = false
  return content
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
      const match = !fenced && line.match(IMPORT)
      if (!match) return line
      const target = match[1]!.startsWith("~/")
        ? path.join(home, match[1]!.slice(2))
        : path.resolve(path.dirname(file), match[1]!)
      if (seen.has(target)) return line
      const imported = readText(target)
      if (imported === undefined) return line
      return `<imported from ${target}>\n${expandImports(imported, target, home, depth + 1, new Set([...seen, target])).trim()}\n</imported>`
    })
    .join("\n")
}

export type Rule = { file: string; paths?: string[]; body: string }

/** Every rule in the project's .dev/rules and .claude/rules folders, any depth. */
export function rules(root: string): Rule[] {
  return [".dev/rules", ".claude/rules"].flatMap((folder) => {
    const dir = path.join(root, folder)
    if (!fs.existsSync(dir)) return []
    return [...new Bun.Glob("**/*.md").scanSync({ cwd: dir, absolute: true })].sort().flatMap((file) => {
      const text = readText(file)
      if (text === undefined) return []
      const parsed = ConfigMarkdown.parseOption(text)
      const raw = parsed?.data?.paths
      const paths = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw.map(String) : undefined
      return [{ file, paths: paths?.length ? paths : undefined, body: (parsed?.content ?? text).trim() }]
    })
  })
}

/** Whether a scoped rule applies to `file`, given as a path relative to the project root. */
export function applies(rule: Rule, file: string) {
  const relative = file.split(path.sep).join("/")
  return rule.paths?.some((pattern) => new Bun.Glob(pattern).match(relative)) ?? false
}

function readText(file: string) {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return undefined
  }
}

// Auto memory: one-line notes DeV saves itself (corrections, preferences, project facts that are not
// obvious from the code), kept per project in DeV's data folder rather than in the repository.
const AUTO_LINES = 200

export function autoFile(dataDir: string, project: string) {
  return path.join(dataDir, "memory", project.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "root", "MEMORY.md")
}

/** The first lines of the project's auto memory, or undefined when it has none. */
export function autoMemory(file: string) {
  const text = readText(file)?.trim()
  if (!text) return
  return text.split("\n").slice(0, AUTO_LINES).join("\n")
}

/** Adds a note, or removes every note containing `remove`. Returns the notes now saved. */
export function remember(file: string, input: { note?: string; remove?: string }) {
  const lines = (readText(file) ?? "").split("\n").filter((line) => line.trim())
  const kept = input.remove ? lines.filter((line) => !line.toLowerCase().includes(input.remove!.toLowerCase())) : lines
  const note = input.note?.replace(/\s+/g, " ").trim()
  const next = note && !kept.some((line) => line.slice(2) === note) ? [...kept, `- ${note}`] : kept
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, next.join("\n") + (next.length ? "\n" : ""))
  return { removed: lines.length - kept.length, saved: next.length }
}

export * as MemoryFiles from "./memory-files"
