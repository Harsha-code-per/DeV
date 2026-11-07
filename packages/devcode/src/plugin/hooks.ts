import type { Hooks, PluginInput } from "@dev-ai/plugin"
import type { ConfigHooksV1 } from "@dev-ai/core/v1/config/hooks"
import { PartID } from "@/session/schema"
import { Process } from "@/util/process"

// User hooks from the `hooks` setting, in the common hooks format: each command
// gets the event as JSON on stdin; exit code 2 blocks PreToolUse and UserPromptSubmit (stderr is the
// reason the agent or user sees) and reports stderr to the agent on PostToolUse; any other exit code is
// logged and ignored. UserPromptSubmit and SessionStart stdout is added to the (first) prompt as context.
// Exit code 2 on Stop keeps the agent working, with stderr as its next instruction; the hook then sees
// stop_hook_active: true and should let it stop, and DeV stops after MAX_CONTINUES in a row regardless.
// PreCompact stdout is added to the compaction instructions. Notification, SubagentStop,
// PostToolUseFailure, PostCompact, SessionEnd and FileChanged only inform. An http hook receives the
// same JSON as a POST; its 2xx body counts as stdout, and {"decision":"block","reason":…} as exit 2.
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
    "experimental.session.compacting": async (info, output) => {
      if (!state.hooks?.PreCompact) return
      output.context.push(...stdout(await run("PreCompact", { session_id: info.sessionID, trigger: "auto" })))
    },
    event: async ({ event }) => {
      const props = event.properties as
        | {
            sessionID?: string
            info?: { id?: string; parentID?: string }
            part?: { type?: string; tool?: string; state?: { status?: string; input?: unknown; error?: string } }
            title?: string
            file?: string
          }
        | undefined
      const notify = (message: string, type: string) =>
        run("Notification", { session_id: props?.sessionID, message, notification_type: type })
      if (event.type === "permission.updated" && state.hooks?.Notification)
        await notify(`DeV needs your permission: ${props?.title ?? "a tool"}`, "permission_prompt")
      if (event.type === "session.compacted" && state.hooks?.PostCompact)
        await run("PostCompact", { session_id: props?.sessionID })
      if (event.type === "session.deleted" && state.hooks?.SessionEnd && props?.info?.id && !props.info.parentID)
        await run("SessionEnd", { session_id: props.info.id, reason: "deleted" })
      if (event.type === "file.edited" && state.hooks?.FileChanged && props?.file)
        await run("FileChanged", { file_path: props.file })
      if (
        event.type === "message.part.updated" &&
        state.hooks?.PostToolUseFailure &&
        props?.part?.type === "tool" &&
        props.part.state?.status === "error"
      )
        await run(
          "PostToolUseFailure",
          {
            session_id: props.sessionID,
            tool_name: props.part.tool,
            tool_input: props.part.state.input,
            error: props.part.state.error,
          },
          props.part.tool,
        )
      if (event.type === "session.idle" && state.hooks?.SubagentStop && props?.sessionID) {
        const info = await input.client.session.get({ path: { id: props.sessionID } }).catch(() => undefined)
        if (info?.data?.parentID)
          await run("SubagentStop", { session_id: props.sessionID, parent_session_id: info.data.parentID })
      }
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
      if (hook.type === "http") return post(hook, payload)
      const shell = process.platform === "win32" ? ["cmd", "/c"] : ["sh", "-c"]
      const result = await Process.run([...shell, hook.command], {
        cwd,
        input: JSON.stringify(payload),
        abort: AbortSignal.timeout((hook.timeout ?? 60) * 1000),
        nothrow: true,
      })
      return { code: result.code, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
    }),
  )
}

async function post(hook: typeof ConfigHooksV1.Http.Type, payload: Record<string, unknown>) {
  const response = await fetch(hook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...hook.headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout((hook.timeout ?? 60) * 1000),
  }).catch((error: Error) => error)
  if (response instanceof Error) return { code: 1, stdout: "", stderr: response.message }
  const body = await response.text().catch(() => "")
  if (!response.ok) return { code: 1, stdout: "", stderr: `HTTP ${response.status}` }
  const decision = parseDecision(body)
  if (decision?.decision === "block") return { code: 2, stdout: "", stderr: decision.reason ?? "blocked" }
  return { code: 0, stdout: body, stderr: "" }
}

function parseDecision(body: string) {
  try {
    const value = JSON.parse(body) as { decision?: string; reason?: string }
    return typeof value === "object" && value ? value : undefined
  } catch {
    return undefined
  }
}
