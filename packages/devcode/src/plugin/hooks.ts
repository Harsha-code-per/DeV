import type { Hooks, PluginInput } from "@dev-ai/plugin"
import type { ConfigHooksV1 } from "@dev-ai/core/v1/config/hooks"
import { PartID } from "@/session/schema"
import { Process } from "@/util/process"

// User hooks from the `hooks` setting, in the common hooks format, so hooks written for other agents (and the ones
// inside marketplace plugins) work unchanged. Each hook gets the event as JSON on stdin, with tool names and inputs
// in that format ("Bash", tool_input.file_path).
//
// A hook answers with its exit code or with one JSON object on stdout:
// - exit 2, {"decision":"block","reason":…} or {"continue":false,"stopReason":…} blocks PreToolUse and
//   UserPromptSubmit, keeps the agent working on Stop (the reason is its next instruction), and is fed back to the
//   agent on PostToolUse. Any other non-zero exit is logged and ignored.
// - PreToolUse hookSpecificOutput: permissionDecision "deny" blocks, "ask" always prompts, "allow" skips the prompt
//   for that call (a deny rule still wins); updatedInput replaces the tool's input; additionalContext is added to
//   the tool's result.
// - PostToolUse: additionalContext is added to the result; updatedToolOutput (or updatedMCPToolOutput) replaces it.
// - UserPromptSubmit and SessionStart: plain stdout or additionalContext is added to the (first) prompt.
// - PermissionRequest: hookSpecificOutput.decision {behavior: "allow" | "deny"} answers the permission prompt.
// - A prompt hook asks a model the hook's question about the event; an agent hook does the same with Read, Grep
//   and Glob to look around. Either answers {"ok": true} or {"ok": false, "reason": …}, and false counts as exit 2.
// PreCompact stdout is added to the compaction instructions. Notification, SubagentStart, SubagentStop,
// PostToolUseFailure, PostCompact, SessionEnd and FileChanged only inform. An http hook receives the same JSON as a
// POST and answers with its 2xx body the same way.
const MAX_CONTINUES = 3

// DeV's tool ids, as the names hooks written in the common format expect. A matcher may use either.
const COMMON: Record<string, string[]> = {
  bash: ["Bash"],
  read: ["Read"],
  write: ["Write"],
  edit: ["Edit"],
  glob: ["Glob"],
  grep: ["Grep"],
  list: ["LS"],
  webfetch: ["WebFetch"],
  websearch: ["WebSearch"],
  task: ["Agent", "Task"],
  todowrite: ["TodoWrite"],
  skill: ["Skill"],
  question: ["AskUserQuestion"],
  notebook_edit: ["NotebookEdit"],
}

type Result = { code: number; stdout: string; stderr: string; json?: Output }
type Output = {
  continue?: boolean
  stopReason?: string
  decision?: string
  reason?: string
  hookSpecificOutput?: {
    permissionDecision?: string
    permissionDecisionReason?: string
    updatedInput?: Record<string, unknown>
    additionalContext?: string
    updatedToolOutput?: unknown
    updatedMCPToolOutput?: unknown
    decision?: { behavior?: string; message?: string }
  }
}

export async function HooksPlugin(input: PluginInput): Promise<Hooks> {
  const state: { hooks?: ConfigHooksV1.Info } = {}
  // SessionStart output is a promise because the first prompt can arrive before the hook finishes.
  const sessions = new Map<string, { context?: Promise<string | undefined>; continues: number }>()
  const session = (id: string) => sessions.get(id) ?? sessions.set(id, { continues: 0 }).get(id)!
  // PreToolUse additionalContext, added to that call's result.
  const pending = new Map<string, string>()
  // Sessions that prompt and agent hooks run in; hooks don't fire inside them, so a hook can't trigger itself.
  const own = new Set<string>()
  const run = (event: ConfigHooksV1.Event, payload: Record<string, unknown>, names?: string[]) =>
    typeof payload.session_id === "string" && own.has(payload.session_id)
      ? Promise.resolve([])
      : runHooks(state.hooks?.[event] ?? [], { hook_event_name: event, cwd: input.directory, ...payload }, input.directory, names, judge)

  // A prompt or agent hook: a hidden one-off session (a child of the one the event came from) with tools off, or
  // only Read, Grep and Glob, asked the hook's question. It is deleted afterwards.
  async function judge(hook: Judge, payload: Record<string, unknown>): Promise<Result> {
    const parentID = typeof payload.session_id === "string" ? payload.session_id : undefined
    const created = await input.client.session.create({ body: { parentID, title: `${hook.type} hook` } }).catch(() => undefined)
    const id = created?.data?.id
    if (!id) return { code: 1, stdout: "", stderr: "could not start the hook's session" }
    own.add(id)
    const event = JSON.stringify(payload)
    const question = hook.prompt.includes("$ARGUMENTS") ? hook.prompt.replaceAll("$ARGUMENTS", event) : `${hook.prompt}\n\n${event}`
    const [providerID, ...rest] = hook.model?.split("/") ?? []
    const reply = await Promise.race([
      input.client.session
        .prompt({
          path: { id },
          body: {
            system: JUDGE_SYSTEM,
            tools: hook.type === "agent" ? { "*": false, read: true, grep: true, glob: true } : { "*": false },
            ...(providerID && rest.length ? { model: { providerID, modelID: rest.join("/") } } : {}),
            parts: [{ type: "text", text: question }],
          },
        })
        .then((response) => (response.data?.parts ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"))
        .catch(() => undefined),
      Bun.sleep((hook.timeout ?? (hook.type === "agent" ? 60 : 30)) * 1000).then(() => undefined),
    ])
    void input.client.session.delete({ path: { id } }).catch(() => undefined).finally(() => own.delete(id))
    const verdict = reply === undefined ? undefined : parseVerdict(reply)
    if (!verdict) return { code: 1, stdout: "", stderr: `${hook.type} hook gave no verdict` }
    // On Stop, "impossible" means the goal can't be met, so the turn may end instead of being sent back.
    if (verdict.ok || verdict.impossible) return { code: 0, stdout: "", stderr: "" }
    return { code: 2, stdout: "", stderr: verdict.reason ?? "" }
  }

  return {
    config: async (cfg) => {
      state.hooks = (cfg as { hooks?: ConfigHooksV1.Info }).hooks
    },
    "tool.execute.before": async (info, output) => {
      if (!state.hooks?.PreToolUse || own.has(info.sessionID)) return
      const results = await run(
        "PreToolUse",
        { session_id: info.sessionID, tool_name: toolName(info.tool), tool_input: common(output.args), tool_use_id: info.callID },
        names(info.tool),
      )
      const reason = blocked(results)
      if (reason !== undefined) throw new Error(`Blocked by a PreToolUse hook: ${reason || "no reason given"}`)
      const decisions = results.map((result) => permissionDecision(result.json))
      if (decisions.includes("ask")) output.permission = "ask"
      else if (decisions.includes("allow")) output.permission = "allow"
      const updated = results.findLast((result) => isRecord(result.json?.hookSpecificOutput?.updatedInput))
      // updatedInput replaces the whole input; the tool's own arguments object is what runs, so edit it in place.
      if (updated) {
        for (const key of Object.keys(output.args)) delete output.args[key]
        Object.assign(output.args, native(updated.json!.hookSpecificOutput!.updatedInput!))
      }
      const context = additionalContext(results)
      if (context.length > 0) pending.set(info.callID, context.join("\n"))
    },
    "tool.execute.after": async (info, output) => {
      if (own.has(info.sessionID)) return
      const before = pending.get(info.callID)
      pending.delete(info.callID)
      // A failed subtask reports no output.
      if (!output) return
      if (before) output.output += `\n\nPreToolUse hook:\n${before}`
      if (!state.hooks?.PostToolUse) return
      const results = await run(
        "PostToolUse",
        {
          session_id: info.sessionID,
          tool_name: toolName(info.tool),
          tool_input: common(info.args),
          tool_response: output.output,
          tool_use_id: info.callID,
        },
        names(info.tool),
      )
      const replaced = results.findLast((result) => {
        const specific = result.json?.hookSpecificOutput
        return specific?.updatedToolOutput !== undefined || specific?.updatedMCPToolOutput !== undefined
      })?.json?.hookSpecificOutput
      if (replaced) output.output = text(replaced.updatedToolOutput ?? replaced.updatedMCPToolOutput)
      const feedback = [
        ...results.flatMap((result) => (result.code === 2 ? [result.stderr.trim()] : [])),
        ...results.flatMap((result) => (result.json?.decision === "block" && result.json.reason ? [result.json.reason] : [])),
        ...additionalContext(results),
      ]
      if (feedback.length > 0) output.output += `\n\nPostToolUse hook:\n${feedback.join("\n")}`
    },
    "chat.message": async (info, output) => {
      if ((!state.hooks?.UserPromptSubmit && !state.hooks?.SessionStart) || own.has(info.sessionID)) return
      const prompt = output.parts
        .flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : []))
        .join("\n")
      const results = await run("UserPromptSubmit", { session_id: info.sessionID, prompt })
      const reason = blocked(results)
      if (reason !== undefined) throw new Error(`Prompt blocked by a UserPromptSubmit hook: ${reason || "no reason given"}`)
      const current = session(info.sessionID)
      const context = [await current.context, ...stdout(results), ...additionalContext(results)].filter(
        (item): item is string => Boolean(item),
      )
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
      const reason = blocked(results)?.trim()
      if (!reason || current.continues >= MAX_CONTINUES) {
        current.continues = 0
        return
      }
      current.continues++
      output.continue = `Stop hook: ${reason}`
    },
    "experimental.session.compacting": async (info, output) => {
      if (!state.hooks?.PreCompact) return
      output.context.push(...stdout(await run("PreCompact", { session_id: info.sessionID, trigger: "auto" }, ["auto"])))
    },
    event: async ({ event }) => {
      const props = event.properties as
        | {
            id?: string
            sessionID?: string
            permission?: string
            patterns?: string[]
            metadata?: Record<string, unknown>
            info?: { id?: string; parentID?: string; title?: string }
            part?: { type?: string; tool?: string; state?: { status?: string; input?: unknown; error?: string } }
            title?: string
            file?: string
          }
        | undefined
      // The plugin API's event list predates this name; it is what a permission prompt publishes now.
      if ((event.type as string) === "permission.asked" && props?.id && props.sessionID) {
        if (state.hooks?.Notification)
          await run(
            "Notification",
            {
              session_id: props.sessionID,
              message: `DeV needs your permission to use ${toolName(props.permission ?? "a tool")}`,
              notification_type: "permission_prompt",
            },
            ["permission_prompt"],
          )
        if (state.hooks?.PermissionRequest) await permissionRequest({ ...props, id: props.id, sessionID: props.sessionID })
      }
      if (event.type === "session.compacted" && state.hooks?.PostCompact)
        await run("PostCompact", { session_id: props?.sessionID, trigger: "auto" }, ["auto"])
      if (event.type === "session.deleted" && state.hooks?.SessionEnd && props?.info?.id && !props.info.parentID)
        await run("SessionEnd", { session_id: props.info.id, reason: "other" }, ["other"])
      if (event.type === "file.edited" && state.hooks?.FileChanged && props?.file)
        await run("FileChanged", { file_path: props.file, event: "change" }, [props.file.split(/[\\/]/).at(-1)!])
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
            tool_name: toolName(props.part.tool ?? ""),
            tool_input: common(props.part.state.input),
            error: props.part.state.error,
          },
          names(props.part.tool ?? ""),
        )
      if (event.type === "session.idle" && state.hooks?.SubagentStop && props?.sessionID && !own.has(props.sessionID)) {
        const info = await input.client.session.get({ path: { id: props.sessionID } }).catch(() => undefined)
        if (info?.data?.parentID)
          await run("SubagentStop", { session_id: props.sessionID, parent_session_id: info.data.parentID, agent_id: props.sessionID })
      }
      if (
        event.type === "session.created" &&
        props?.info?.id &&
        props.info.parentID &&
        state.hooks?.SubagentStart &&
        !own.has(props.info.id)
      )
        await run("SubagentStart", {
          session_id: props.info.parentID,
          agent_id: props.info.id,
          description: props.info.title,
        })
      if (event.type === "session.created" && state.hooks?.SessionStart && props?.info?.id && !props.info.parentID) {
        const context = run("SessionStart", { session_id: props.info.id, source: "startup" }, ["startup"]).then(
          (results) => [...stdout(results), ...additionalContext(results)].join("\n\n") || undefined,
        )
        session(props.info.id).context = context
        await context
      }
    },
  }

  // A PermissionRequest hook can answer the prompt the person would otherwise see.
  async function permissionRequest(request: { id: string; sessionID: string; permission?: string; patterns?: string[]; metadata?: Record<string, unknown> }) {
    const results = await run(
      "PermissionRequest",
      {
        session_id: request.sessionID,
        tool_name: toolName(request.permission ?? ""),
        tool_input: common(request.metadata ?? {}),
        patterns: request.patterns,
      },
      names(request.permission ?? ""),
    )
    const behaviors = results.map((result) => result.json?.hookSpecificOutput?.decision?.behavior)
    // A deny from any hook wins over an allow from another.
    const response = behaviors.includes("deny") ? "reject" : behaviors.includes("allow") ? "once" : undefined
    if (!response) return
    await input.client
      .postSessionIdPermissionsPermissionId({ path: { id: request.sessionID, permissionID: request.id }, body: { response } })
      .catch(() => undefined)
  }
}

function toolName(tool: string) {
  return COMMON[tool]?.[0] ?? tool
}

function names(tool: string) {
  return [tool, ...(COMMON[tool] ?? [])]
}

/** A tool's arguments as hooks in the common format read them: filePath becomes file_path. */
function common(args: unknown) {
  if (!isRecord(args)) return args
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value]))
}

/** updatedInput back as DeV's arguments: file_path becomes filePath. */
function native(args: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value]))
}

function blocked(results: Result[]) {
  for (const result of results) {
    if (result.code === 2) return result.stderr.trim()
    const json = result.json
    if (!json) continue
    if (json.decision === "block" || json.decision === "deny") return json.reason ?? ""
    if (json.continue === false) return json.stopReason ?? ""
    if (json.hookSpecificOutput?.permissionDecision === "deny") return json.hookSpecificOutput.permissionDecisionReason ?? ""
  }
  return undefined
}

function permissionDecision(json: Output | undefined) {
  const decision = json?.hookSpecificOutput?.permissionDecision
  if (decision) return decision
  // The older top-level form: "approve" is allow.
  return json?.decision === "approve" ? "allow" : undefined
}

function additionalContext(results: Result[]) {
  return results.flatMap((result) => {
    const context = result.json?.hookSpecificOutput?.additionalContext
    return typeof context === "string" && context.trim() ? [context.trim()] : []
  })
}

function stdout(results: Result[]) {
  return results.flatMap((result) =>
    result.code === 0 && !result.json && result.stdout.trim() ? [result.stdout.trim()] : [],
  )
}

function text(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value)
}

/**
 * Which hook groups run: no matcher, "" or "*" matches everything; letters, digits, "_", "-", spaces, "," and "|"
 * are an exact list ("Edit|Write"); anything else is a regular expression ("mcp__.*", "^Notebook").
 */
function matches(matcher: string | undefined, names: string[] | undefined) {
  if (!names || !matcher || matcher === "*") return true
  if (/^[\w\s,|-]*$/.test(matcher)) {
    const list = matcher.split(/[|,]/).map((item) => item.trim().toLowerCase())
    return names.some((name) => list.includes(name.toLowerCase()))
  }
  const pattern = regex(matcher)
  return pattern ? names.some((name) => pattern.test(name)) : false
}

function regex(source: string) {
  try {
    return new RegExp(source)
  } catch {
    return undefined
  }
}

async function runHooks(
  matchers: ConfigHooksV1.Info["PreToolUse"] & {},
  payload: Record<string, unknown>,
  cwd: string,
  names: string[] | undefined,
  judge: (hook: Judge, payload: Record<string, unknown>) => Promise<Result>,
): Promise<Result[]> {
  const commands = matchers.filter((entry) => matches(entry.matcher, names)).flatMap((entry) => entry.hooks)
  return Promise.all(
    commands.map(async (hook) => {
      if (hook.type === "http") return post(hook, payload)
      if (hook.type === "prompt" || hook.type === "agent") return judge(hook, payload)
      const shell = process.platform === "win32" ? ["cmd", "/c"] : ["sh", "-c"]
      const result = await Process.run([...shell, hook.command], {
        cwd,
        input: JSON.stringify(payload),
        // The project root, under both names: DeV's own and the one shared hook scripts use.
        env: { ...process.env, DEV_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: cwd },
        abort: AbortSignal.timeout((hook.timeout ?? 60) * 1000),
        nothrow: true,
      })
      const out = result.stdout.toString()
      return { code: result.code, stdout: out, stderr: result.stderr.toString(), json: parseOutput(out) }
    }),
  )
}

async function post(hook: typeof ConfigHooksV1.Http.Type, payload: Record<string, unknown>): Promise<Result> {
  const response = await fetch(hook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...hook.headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout((hook.timeout ?? 60) * 1000),
  }).catch((error: Error) => error)
  if (response instanceof Error) return { code: 1, stdout: "", stderr: response.message }
  const body = await response.text().catch(() => "")
  if (!response.ok) return { code: 1, stdout: "", stderr: `HTTP ${response.status}` }
  return { code: 0, stdout: body, stderr: "", json: parseOutput(body) }
}

/** Output is JSON only when it is one object with nothing else around it; anything else is plain text. */
function parseOutput(text: string): Output | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined
  try {
    const value: unknown = JSON.parse(trimmed)
    return isRecord(value) ? (value as Output) : undefined
  } catch {
    return undefined
  }
}

type Judge = typeof ConfigHooksV1.Prompt.Type | typeof ConfigHooksV1.Agent.Type

const JUDGE_SYSTEM = [
  "You check one condition for an automated hook in a coding agent. You get the condition and the event as JSON.",
  "Decide whether the condition is met. If you have tools, use them only to look; never change anything.",
  'Reply with one JSON object and nothing else: {"ok": true} when it is met, or {"ok": false, "reason": "what is wrong"} when not.',
  'Add "impossible": true only when it can never be met.',
].join("\n")

/** The model's {"ok": …} answer, even when it wraps it in prose or a code fence. */
function parseVerdict(reply: string) {
  const found = reply.match(/\{[\s\S]*\}/)?.[0]
  const value = found ? parseOutput(found) : undefined
  return value && typeof (value as { ok?: unknown }).ok === "boolean"
    ? (value as { ok: boolean; reason?: string; impossible?: boolean })
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
