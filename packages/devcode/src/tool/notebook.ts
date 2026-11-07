import { Effect, Schema } from "effect"
import * as path from "path"
import { randomBytes } from "crypto"
import * as Tool from "./tool"
import { EventV2Bridge } from "@/event-v2-bridge"
import { FileSystem } from "@dev-ai/core/filesystem"
import { Watcher } from "@dev-ai/core/filesystem/watcher"
import { FSUtil } from "@dev-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { assertExternalDirectoryEffect } from "./external-directory"

// Jupyter notebooks (.ipynb): read shows cells with their ids and outputs, notebook_edit
// replaces, inserts or deletes one cell. Cells without an id (nbformat before 4.5) are addressed as "cell-<index>".

type Cell = { id?: string; cell_type: string; source: string | string[]; outputs?: Output[]; execution_count?: unknown }
type Output = {
  output_type: string
  text?: string | string[]
  data?: Record<string, unknown>
  ename?: string
  evalue?: string
}
type Notebook = { cells: Cell[]; metadata?: { language_info?: { name?: string } } }

const NotebookJson = Schema.UnknownFromJsonString

export function parseNotebook(text: string) {
  const value = Schema.decodeUnknownOption(NotebookJson)(text)
  if (value._tag === "None") return
  const notebook = value.value as Notebook
  return Array.isArray(notebook?.cells) ? notebook : undefined
}

export function renderNotebook(notebook: Notebook) {
  const language = notebook.metadata?.language_info?.name ?? "python"
  return notebook.cells
    .map((cell, index) => {
      const head = `<cell id="${cellID(cell, index)}" type="${cell.cell_type}"${cell.cell_type === "code" ? ` language="${language}"` : ""}>`
      const outputs = (cell.outputs ?? []).map(renderOutput).filter(Boolean)
      return [
        head,
        join(cell.source),
        "</cell>",
        ...(outputs.length ? [`<outputs>\n${outputs.join("\n")}\n</outputs>`] : []),
      ].join("\n")
    })
    .join("\n\n")
}

function renderOutput(output: Output) {
  if (output.output_type === "error") return `${output.ename}: ${output.evalue}`
  if (output.text !== undefined) return join(output.text)
  const data = output.data ?? {}
  if (data["text/plain"] !== undefined) return join(data["text/plain"] as string | string[])
  const kind = Object.keys(data)[0]
  return kind ? `[${kind} output]` : ""
}

const join = (value: string | string[]) => (Array.isArray(value) ? value.join("") : value)
const cellID = (cell: Cell, index: number) => cell.id ?? `cell-${index}`

export const Parameters = Schema.Struct({
  notebook_path: Schema.String.annotate({ description: "Absolute path to the .ipynb file" }),
  cell_id: Schema.optional(Schema.String).annotate({
    description:
      "Id of the cell to replace or delete, as shown by read. For insert, the new cell goes after this one; omit it to insert at the start",
  }),
  new_source: Schema.String.annotate({ description: "The cell's new source (ignored for delete)" }),
  cell_type: Schema.optional(Schema.Literals(["code", "markdown"])).annotate({
    description: "Required for insert; for replace it defaults to the cell's current type",
  }),
  edit_mode: Schema.optional(Schema.Literals(["replace", "insert", "delete"])).annotate({
    description: "replace (default), insert or delete",
  }),
})

export const NotebookEditTool = Tool.define(
  "notebook_edit",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service

    return {
      description:
        "Edit one cell of a Jupyter notebook (.ipynb): replace its source, insert a new cell, or delete it. Read the notebook first to see cell ids. Replacing a code cell clears its outputs. Use this instead of edit or write for .ipynb files.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const filepath = path.isAbsolute(params.notebook_path)
            ? params.notebook_path
            : path.join(instance.directory, params.notebook_path)
          if (!filepath.endsWith(".ipynb"))
            return yield* Effect.fail(new Error("notebook_edit only edits .ipynb files"))
          yield* assertExternalDirectoryEffect(ctx, filepath, { write: true })

          const notebook = parseNotebook(yield* fs.readFileString(filepath))
          if (!notebook) return yield* Effect.fail(new Error(`${filepath} is not a valid notebook`))
          const mode = params.edit_mode ?? "replace"
          const index =
            params.cell_id === undefined
              ? -1
              : notebook.cells.findIndex((cell, i) => cellID(cell, i) === params.cell_id)
          if (params.cell_id !== undefined && index === -1)
            return yield* Effect.fail(new Error(`No cell ${params.cell_id}. Read the notebook to see cell ids.`))
          if (mode !== "insert" && index === -1) return yield* Effect.fail(new Error(`cell_id is required to ${mode}`))
          if (mode === "insert" && !params.cell_type)
            return yield* Effect.fail(new Error("cell_type is required to insert"))

          yield* ctx.ask({
            permission: "edit",
            patterns: [path.relative(instance.worktree, filepath)],
            always: ["*"],
            metadata: {
              filepath,
              diff: `${mode} ${params.cell_id ?? "at start"}\n${mode === "delete" ? "" : params.new_source}`,
            },
          })

          const make = (type: string): Cell =>
            ({
              ...(notebook.cells.some((cell) => cell.id) || notebook.cells.length === 0
                ? { id: randomBytes(4).toString("hex") }
                : {}),
              cell_type: type,
              metadata: {},
              source: params.new_source,
              ...(type === "code" ? { execution_count: null, outputs: [] } : {}),
            }) as Cell
          const target = notebook.cells[index]
          const changed =
            mode === "delete"
              ? notebook.cells.toSpliced(index, 1)
              : mode === "insert"
                ? notebook.cells.toSpliced(index + 1, 0, make(params.cell_type!))
                : notebook.cells.toSpliced(index, 1, {
                    ...make(params.cell_type ?? target!.cell_type),
                    ...(target!.id ? { id: target!.id } : {}),
                    metadata: (target as Cell & { metadata?: unknown }).metadata ?? {},
                  } as Cell)
          yield* fs.writeWithDirs(filepath, JSON.stringify({ ...notebook, cells: changed }, null, 1) + "\n")
          yield* events.publish(FileSystem.Event.Edited, { file: filepath })
          yield* events.publish(Watcher.Event.Updated, { file: filepath, event: "change" })

          return {
            title: path.relative(instance.worktree, filepath),
            metadata: { filepath },
            output: `${mode === "delete" ? "Deleted" : mode === "insert" ? "Inserted" : "Replaced"} cell. The notebook now has ${changed.length} cells.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
