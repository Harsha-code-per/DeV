import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, Schema } from "effect"
import { Global } from "@dev-ai/core/global"
import { openFile } from "@dev-ai/core/open"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./artifact.txt"

// Artifacts: web pages DeV makes for you (a report, a chart, a diagram, a small tool) and opens in your
// browser. They stay on this computer, in DeV's data folder, one folder per project. Turn the tool off with
// "permission": { "artifact": "deny" }.

export const Parameters = Schema.Struct({
  name: Schema.String.annotate({
    description: "A short name for the page, such as 'test coverage report'. Using the same name again replaces it",
  }),
  html: Schema.String.annotate({ description: "The complete HTML document, with its CSS and JavaScript inline" }),
})

export const ArtifactTool = Tool.define(
  "artifact",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>) =>
      Effect.gen(function* () {
        const ctx = yield* InstanceState.context
        const project = ctx.worktree === "/" ? ctx.directory : ctx.worktree
        const file = save(path.join(Global.Path.data, "artifacts"), project, params)
        // Opening is best effort: on a server or over SSH there is no browser, and the path is enough.
        const opened = yield* Effect.promise(() => openFile(file).then(() => true, () => false))
        const link = pathToFileURL(file).href
        return {
          title: `Artifact: ${params.name}`,
          output: `Saved the page to ${link}${opened ? " and opened it in the browser" : ""}.`,
          metadata: { file },
        }
      }),
  }),
)

/** Writes the page and returns its path. A fragment is wrapped in a minimal document. */
export function save(root: string, project: string, input: { name: string; html: string }) {
  const file = path.join(root, slug(path.basename(project)), `${slug(input.name)}.html`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, /^\s*(<!doctype|<html)/i.test(input.html) ? input.html : wrap(input.name, input.html))
  return file
}

function slug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  )
}

function wrap(name: string, body: string) {
  const title = name.replace(/[<&>]/g, (c) => `&#${c.charCodeAt(0)};`)
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n<style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}
