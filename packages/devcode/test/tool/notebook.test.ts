import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@dev-ai/core/effect/layer-node"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import { NotebookEditTool, parseNotebook, renderNotebook } from "../../src/tool/notebook"
import { FSUtil } from "@dev-ai/core/fs-util"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { Agent } from "../../src/agent/agent"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@dev-ai/core/cross-spawn-spawner"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const ctx = {
  sessionID: SessionID.make("ses_test-notebook-session"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([FSUtil.node, EventV2Bridge.node, CrossSpawnSpawner.node, Truncate.node, Agent.node]),
  ),
)

const run = Effect.fn("NotebookEditTest.run")(function* (
  args: Tool.InferParameters<typeof NotebookEditTool>,
  next: Tool.Context = ctx,
) {
  const tool = yield* (yield* NotebookEditTool).init()
  return yield* tool.execute(args, next)
})

const notebook = {
  cells: [
    { id: "a1", cell_type: "markdown", metadata: {}, source: ["# Title"] },
    {
      id: "b2",
      cell_type: "code",
      metadata: {},
      execution_count: 3,
      source: ["print(1 + 1)"],
      outputs: [{ output_type: "stream", name: "stdout", text: ["2\n"] }],
    },
  ],
  metadata: { language_info: { name: "python" } },
  nbformat: 4,
  nbformat_minor: 5,
}

const setup = Effect.fn("NotebookEditTest.setup")(function* () {
  const test = yield* TestInstance
  const file = path.join(test.directory, "analysis.ipynb")
  yield* Effect.promise(() => fs.writeFile(file, JSON.stringify(notebook)))
  return file
})

const load = (file: string) => Effect.promise(() => fs.readFile(file, "utf8").then((text) => parseNotebook(text)!))

describe("tool.notebook_edit", () => {
  it.instance("shows cells with ids and outputs for read", () =>
    Effect.sync(() => {
      const text = renderNotebook(notebook)
      expect(text).toContain('<cell id="a1" type="markdown">\n# Title\n</cell>')
      expect(text).toContain('<cell id="b2" type="code" language="python">\nprint(1 + 1)\n</cell>\n<outputs>\n2\n')
    }),
  )

  it.instance("replaces a code cell and clears its outputs", () =>
    Effect.gen(function* () {
      const file = yield* setup()
      const asked: string[] = []
      yield* run(
        { notebook_path: file, cell_id: "b2", new_source: "print(2 + 2)" },
        { ...ctx, ask: (request) => Effect.sync(() => void asked.push(request.permission)) },
      )
      const cell = (yield* load(file)).cells[1]!
      expect(asked).toContain("edit")
      expect(cell).toMatchObject({ id: "b2", cell_type: "code", source: "print(2 + 2)", outputs: [], execution_count: null })
    }),
  )

  it.instance("inserts after a cell, at the start, and deletes", () =>
    Effect.gen(function* () {
      const file = yield* setup()
      yield* run({ notebook_path: file, cell_id: "a1", new_source: "x = 1", cell_type: "code", edit_mode: "insert" })
      yield* run({ notebook_path: file, new_source: "Intro", cell_type: "markdown", edit_mode: "insert" })
      yield* run({ notebook_path: file, cell_id: "b2", new_source: "", edit_mode: "delete" })
      const cells = (yield* load(file)).cells
      expect(cells.map((cell) => cell.source)).toEqual(["Intro", ["# Title"], "x = 1"])
      expect(cells.every((cell) => typeof cell.id === "string")).toBe(true)
    }),
  )

  it.instance("addresses cells without ids by index and rejects unknown ids", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "old.ipynb")
      yield* Effect.promise(() =>
        fs.writeFile(file, JSON.stringify({ ...notebook, cells: notebook.cells.map(({ id: _, ...cell }) => cell) })),
      )
      yield* run({ notebook_path: file, cell_id: "cell-0", new_source: "# New title" })
      expect((yield* load(file)).cells[0]).toMatchObject({ source: "# New title", cell_type: "markdown" })
      const failed = yield* run({ notebook_path: file, cell_id: "nope", new_source: "" }).pipe(Effect.exit)
      expect(failed._tag).toBe("Failure")
    }),
  )
})
