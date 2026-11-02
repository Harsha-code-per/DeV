import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { ShellJobs } from "./shell/jobs"

export const Parameters = Schema.Struct({
  id: Schema.String.annotate({ description: "The job ID the shell tool returned, such as job1" }),
  action: Schema.Literals(["output", "stop"]).annotate({
    description: "output: what the command printed since you last checked, and whether it is still running. stop: end it.",
  }),
})

export const ShellJobTool = Tool.define(
  "shell_job",
  Effect.succeed({
    description:
      "Check on or stop a shell command you started with background: true. Use output to read what it printed since your last check (a dev server's address, a watcher's errors, a build's progress) and stop to end it when you no longer need it.",
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>) =>
      Effect.promise(async () => {
        if (params.action === "stop") {
          const stopped = await ShellJobs.stop(params.id)
          return {
            title: `Stopped ${params.id}`,
            output: stopped ? `${params.id} ${stopped.state}.` : unknown(params.id),
            metadata: {},
          }
        }
        const read = ShellJobs.output(params.id)
        if (!read) return { title: params.id, output: unknown(params.id), metadata: {} }
        const skipped = read.skipped ? `[${read.skipped} earlier bytes skipped]\n` : ""
        return {
          title: `${params.id}: ${read.state}`,
          output: `${params.id} is ${read.state}.\n${skipped}${read.text || "(no new output)"}`,
          metadata: {},
        }
      }),
  }),
)

function unknown(id: string) {
  const known = ShellJobs.list().map((job) => `${job.id} (${job.command}, ${job.state})`)
  return `No background job ${id}.${known.length ? ` Running or finished: ${known.join("; ")}` : ""}`
}
