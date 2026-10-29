import { Effect, Option, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"

// Hands a task to a coding agent the user has installed and signed in to themselves (Claude Code,
// Codex, Gemini CLI), so a Claude, ChatGPT or Google subscription is used through its own official
// tool. DeV only starts the CLI in the project; it never reads or reuses those credentials, which
// those providers forbid for third-party apps.

const AGENTS = {
  claude: {
    name: "Claude Code",
    // Edits are allowed; shell commands outside Claude Code's own allowlist are refused in print mode.
    command: (prompt: string) => ["claude", "-p", "--output-format", "json", "--permission-mode", "acceptEdits", prompt],
    result: (stdout: string) => parse<{ result?: string }>(stdout.trim())?.result,
  },
  codex: {
    name: "Codex",
    command: (prompt: string) => ["codex", "exec", "--json", "--sandbox", "workspace-write", prompt],
    result: (stdout: string) =>
      stdout
        .split("\n")
        .flatMap((line) => parse<{ item?: { type?: string; text?: string } }>(line) ?? [])
        .findLast((event) => event.item?.type === "agent_message")?.item?.text,
  },
  gemini: {
    name: "Gemini CLI",
    command: (prompt: string) => ["gemini", "--output-format", "json", "--approval-mode", "auto_edit", "-p", prompt],
    result: (stdout: string) => parse<{ response?: string }>(stdout.trim())?.response,
  },
} as const

type AgentID = keyof typeof AGENTS

const TIMEOUT_MS = 20 * 60 * 1000

/** The final answer in a CLI's headless output, or undefined when it has none. */
export function answer(id: AgentID, stdout: string) {
  return AGENTS[id].result(stdout)
}

/** The external agents installed on this machine. */
export function installed() {
  return (Object.keys(AGENTS) as AgentID[]).filter((id) => Bun.which(AGENTS[id].command("")[0]))
}

export const Parameters = Schema.Struct({
  agent: Schema.Literals(["claude", "codex", "gemini"]).annotate({
    description: "claude (Claude Code), codex (OpenAI Codex) or gemini (Gemini CLI)",
  }),
  prompt: Schema.String.annotate({
    description: "The complete task, with all the context the other agent needs; it can't see this conversation",
  }),
})

export const ExternalAgentTool = Tool.define(
  "external_agent",
  Effect.gen(function* () {
    return {
      get description() {
        const available = installed().map((id) => `${id} (${AGENTS[id].name})`)
        return [
          "Hand a task to another coding agent the user has installed and signed in to, such as Claude Code with their Claude subscription.",
          "Use it when the user asks for that agent or its models, or for a second opinion. It works in the current project and its file changes are real.",
          "The other agent can't see this conversation: put everything it needs in the prompt. Its answer comes back as the result.",
          `Installed: ${available.join(", ") || "none"}.`,
        ].join("\n")
      },
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const agent = AGENTS[params.agent]
          if (!installed().includes(params.agent))
            throw new Error(`${agent.name} isn't installed or isn't on PATH. Install it and sign in first.`)
          yield* ctx.ask({
            permission: "external_agent",
            patterns: [params.agent],
            always: [params.agent],
            metadata: { agent: params.agent, name: agent.name, prompt: params.prompt },
          })
          yield* ctx.metadata({ title: `${agent.name}: ${params.prompt.slice(0, 60)}` })
          const instance = yield* InstanceState.context
          const run = yield* Effect.promise(async () => {
            const proc = Bun.spawn(agent.command(params.prompt), {
              cwd: instance.directory,
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
              timeout: TIMEOUT_MS,
            })
            const abort = () => proc.kill()
            ctx.abort.addEventListener("abort", abort)
            const [stdout, stderr, code] = await Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ]).finally(() => ctx.abort.removeEventListener("abort", abort))
            return { stdout, stderr, code }
          })
          const result = answer(params.agent, run.stdout)
          if (run.code !== 0 && !result)
            throw new Error(`${agent.name} exited with code ${run.code}: ${(run.stderr || run.stdout).trim().slice(-2000)}`)
          return {
            title: `${agent.name} finished`,
            output: result ?? run.stdout.trim().slice(-20_000),
            metadata: { agent: params.agent, exit: run.code },
          }
        }),
    }
  }),
)

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

// The CLIs' JSON output is read loosely: a field that isn't there just means no answer.
function parse<T>(text: string) {
  return Option.getOrUndefined(decodeJson(text)) as T | undefined
}

export * as ExternalAgent from "./external-agent"
