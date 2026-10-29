import type { Hooks, PluginInput } from "@dev-ai/plugin"
import type { ConfigHooksV1 } from "@dev-ai/core/v1/config/hooks"
import { PartID } from "@/session/schema"

// User hooks from the `hooks` setting, with the semantics of Claude Code's documented hooks: each command
// gets the event as JSON on stdin; exit code 2 blocks PreToolUse and UserPromptSubmit (stderr is the
// reason the agent or user sees) and reports stderr to the agent on PostToolUse; any other exit code is
// logged and ignored. UserPromptSubmit stdout is added to the prompt as context.
// ponytail: Stop and SessionStart only run their commands; exit 2 on Stop (keep going) and SessionStart
// context are not supported yet.
export async function HooksPlugin(input: PluginInput): Promise<Hooks> {
  const state: { hooks?: ConfigHooksV1.Info } = {}
  const run = (event: ConfigHooksV1.Event, payload: Record<string, unknown>, tool?: string) =>
    runHooks(state.hooks?.[event] ?? [], { hook_event_name: event, cwd: input.directory, ...payload }, input.directory, tool)

  return {
    config: async (cfg) => {
      state.hooks = (cfg as { hooks?: ConfigHooksV1.Info }).hooks
    },
    "tool.execute.before": async (info, output) => {
      const results = await run("PreToolUse", { session_id: info.sessionID, tool_name: info.tool, tool_input: output.args }, info.tool)
      const blocked = results.find((result) => result.code === 2)
      if (blocked) throw new Error(`Blocked by a PreToolUse hook: ${blocked.stderr.trim() || "no reason given"}`)
    },
    "tool.execute.after": async (info, output) => {
      const results = await run(
        "PostToolUse",
        { session_id: info.sessionID, tool_name: info.tool, tool_input: info.args, tool_response: output.output },
        info.tool,
      )
      const feedback = results.filter((result) => result.code === 2).map((result) => result.stderr.trim())
      if (feedback.length > 0) output.output += `\n\nPostToolUse hook:\n${feedback.join("\n")}`
    },
    "chat.message": async (info, output) => {
      const prompt = output.parts.flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : [])).join("\n")
      const results = await run("UserPromptSubmit", { session_id: info.sessionID, prompt })
      const blocked = results.find((result) => result.code === 2)
      if (blocked) throw new Error(`Prompt blocked by a UserPromptSubmit hook: ${blocked.stderr.trim() || "no reason given"}`)
      const context = results.flatMap((result) => (result.code === 0 && result.stdout.trim() ? [result.stdout.trim()] : []))
      if (context.length === 0) return
      output.parts.push({
        id: PartID.ascending(),
        sessionID: output.message.sessionID,
        messageID: output.message.id,
        type: "text",
        synthetic: true,
        text: context.join("\n\n"),
      })
    },
    event: async ({ event }) => {
      const props = event.properties as { sessionID?: string; info?: { id?: string } } | undefined
      if (event.type === "session.idle") await run("Stop", { session_id: props?.sessionID })
      if (event.type === "session.created") await run("SessionStart", { session_id: props?.info?.id, source: "startup" })
    },
  }
}

async function runHooks(matchers: ConfigHooksV1.Info["PreToolUse"] & {}, payload: Record<string, unknown>, cwd: string, tool?: string) {
  const commands = matchers
    .filter((entry) => !tool || !entry.matcher || new RegExp(`^(?:${entry.matcher})$`, "i").test(tool))
    .flatMap((entry) => entry.hooks)
  return Promise.all(
    commands.map(async (hook) => {
      const shell = process.platform === "win32" ? ["cmd", "/c"] : ["sh", "-c"]
      const proc = Bun.spawn([...shell, hook.command], {
        cwd,
        stdin: new Blob([JSON.stringify(payload)]),
        stdout: "pipe",
        stderr: "pipe",
        timeout: (hook.timeout ?? 60) * 1000,
      })
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      return { code, stdout, stderr }
    }),
  )
}
