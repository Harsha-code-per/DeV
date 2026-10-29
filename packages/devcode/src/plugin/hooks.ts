import type { Hooks, PluginInput } from "@dev-ai/plugin"
import type { ConfigHooksV1 } from "@dev-ai/core/v1/config/hooks"
import { PartID } from "@/session/schema"

// User hooks from the `hooks` setting, with the semantics of Claude Code's documented hooks: each command
// gets the event as JSON on stdin; exit code 2 blocks PreToolUse and UserPromptSubmit (stderr is the
// reason the agent or user sees) and reports stderr to the agent on PostToolUse; any other exit code is
// logged and ignored. UserPromptSubmit and SessionStart stdout is added to the (first) prompt as context.
// Exit code 2 on Stop keeps the agent working, with stderr as its next instruction; the hook then sees
// stop_hook_active: true and should let it stop, and DeV stops after MAX_CONTINUES in a row regardless.
const MAX_CONTINUES = 3

export async function HooksPlugin(input: PluginInput): Promise<Hooks> {
  const state: { hooks?: ConfigHooksV1.Info } = {}
  // SessionStart output is a promise because the first prompt can arrive before the hook finishes.
  const sessions = new Map<string, { context?: Promise<string | undefined>; continues: number }>()
  const session = (id: string) => sessions.get(id) ?? sessions.set(id, { continues: 0 }).get(id)!
  const run = (event: ConfigHooksV1.Event, payload: Record<string, unknown>, tool?: string) =>
    runHooks(
      state.hooks?.[event] ?? [],
      { hook_event_name: event, cwd: input.directory, ...payload },
      input.directory,
      tool,
    )

  return {
    config: async (cfg) => {
      state.hooks = (cfg as { hooks?: ConfigHooksV1.Info }).hooks
    },
    "tool.execute.before": async (info, output) => {
      if (!state.hooks?.PreToolUse) return
      const results = await run(
        "PreToolUse",
        { session_id: info.sessionID, tool_name: info.tool, tool_input: output.args },
        info.tool,
      )
      const blocked = results.find((result) => result.code === 2)
      if (blocked) throw new Error(`Blocked by a PreToolUse hook: ${blocked.stderr.trim() || "no reason given"}`)
    },
    "tool.execute.after": async (info, output) => {
      // A failed subtask reports no output.
      if (!state.hooks?.PostToolUse || !output) return
      const results = await run(
        "PostToolUse",
        { session_id: info.sessionID, tool_name: info.tool, tool_input: info.args, tool_response: output.output },
        info.tool,
      )
      const feedback = results.filter((result) => result.code === 2).map((result) => result.stderr.trim())
      if (feedback.length > 0) output.output += `\n\nPostToolUse hook:\n${feedback.join("\n")}`
    },
    "chat.message": async (info, output) => {
      if (!state.hooks?.UserPromptSubmit && !state.hooks?.SessionStart) return
      const prompt = output.parts
        .flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : []))
        .join("\n")
      const results = await run("UserPromptSubmit", { session_id: info.sessionID, prompt })
      const blocked = results.find((result) => result.code === 2)
      if (blocked)
        throw new Error(`Prompt blocked by a UserPromptSubmit hook: ${blocked.stderr.trim() || "no reason given"}`)
      const current = session(info.sessionID)
      const context = [await current.context, ...stdout(results)].filter((text): text is string => Boolean(text))
      current.context = undefined
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
    "experimental.session.stop": async (info, output) => {
      // Stop is for the main conversation; subagent sessions finish into their parent.
      if (info.parentID || !state.hooks?.Stop) return
      const current = session(info.sessionID)
      const results = await run("Stop", { session_id: info.sessionID, stop_hook_active: current.continues > 0 })
      const reason = results.find((result) => result.code === 2)?.stderr.trim()
      if (!reason || current.continues >= MAX_CONTINUES) {
        current.continues = 0
        return
      }
      current.continues++
      output.continue = `Stop hook: ${reason}`
    },
    event: async ({ event }) => {
      const props = event.properties as { sessionID?: string; info?: { id?: string; parentID?: string } } | undefined
      if (event.type === "session.created" && state.hooks?.SessionStart && props?.info?.id && !props.info.parentID) {
        const context = run("SessionStart", { session_id: props.info.id, source: "startup" }).then(
          (results) => stdout(results).join("\n\n") || undefined,
        )
        session(props.info.id).context = context
        await context
      }
    },
  }
}

function stdout(results: { code: number; stdout: string }[]) {
  return results.flatMap((result) => (result.code === 0 && result.stdout.trim() ? [result.stdout.trim()] : []))
}

async function runHooks(
  matchers: ConfigHooksV1.Info["PreToolUse"] & {},
  payload: Record<string, unknown>,
  cwd: string,
  tool?: string,
) {
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
