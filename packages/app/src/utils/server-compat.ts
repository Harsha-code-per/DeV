import type {
  IntegrationsAttemptStatusOutput,
  IntegrationsConnectOauthOutput,
  IntegrationsGetOutput,
  MessagesListInput,
  SessionsCommitInput,
  SessionsMessageInput,
} from "@dev-ai/client"
import type { ServerApi, SessionInfo } from "./server"
import type { AgentPartInput, FilePartInput, DevcodeClient, Session, TextPartInput } from "@dev-ai/sdk/v2/client"

type LegacyFor = (directory?: string) => DevcodeClient
type Location = { directory?: string }
type Mention = { start: number; end: number; text: string }
type ModelRef = { id: string; providerID: string; variant?: string }
type LegacyPrompt = {
  agent?: string
  model?: { providerID: string; modelID: string }
  variant?: string
  legacyParts?: (TextPartInput | FilePartInput | AgentPartInput)[]
}
export type SessionListInput = {
  directory?: string
  parentID?: string | null
  search?: string
  limit?: number
  order?: "asc" | "desc"
  cursor?: string
}
export type SessionPromptInput = {
  sessionID: string
  id?: string
  text: string
  files?: { uri: string; name?: string; description?: string; mention?: Mention }[]
  agents?: { name: string; mention?: Mention }[]
  delivery?: "steer" | "queue"
}
export type CompatibleApi = ReturnType<typeof createCompatibleApi>
export type SessionApi = CompatibleApi["session"]
type CompatibleInput = {
  current: ServerApi
  legacy: LegacyFor
  directory?: string
}

function mime(uri: string) {
  const match = /^data:([^;,]+)/.exec(uri)
  return match?.[1] ?? "application/octet-stream"
}

function sessionInfo(session: Session): SessionInfo {
  return {
    id: session.id,
    parentID: session.parentID,
    projectID: session.projectID,
    agent: session.agent,
    model: session.model && {
      id: session.model.id,
      providerID: session.model.providerID,
      variant: session.model.variant,
    },
    cost: session.cost ?? 0,
    tokens: session.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: session.time,
    title: session.title,
    location: { directory: session.directory, workspaceID: session.workspaceID },
    subpath: session.path,
    revert: session.revert && {
      messageID: session.revert.messageID,
      partID: session.revert.partID,
      snapshot: session.revert.snapshot,
    },
  }
}

// DeV's server serves the legacy routes for everything the app needs; its /api routes (@dev-ai/client)
// cover only messages and revert commits here.
export function createCompatibleApi(input: CompatibleInput) {
  const directory = (location?: Location) => location?.directory ?? input.directory
  const legacy = (location?: Location) => input.legacy(directory(location))
  const located = <T>(data: T, value?: Location) => ({
    location: {
      directory: directory(value) ?? "",
      project: { id: "", directory: directory(value) ?? "" },
    },
    data,
  })

  return {
    message: { list: (value: MessagesListInput) => input.current.messages.list(value) },
    session: {
      message: (value: SessionsMessageInput) => input.current.sessions.message(value),
      async list(value?: SessionListInput, options?: { signal?: AbortSignal }) {
        if (!value?.directory && value?.search !== undefined) {
          const result = await legacy().experimental.session.list(
            {
              roots: value.parentID === null ? true : undefined,
              search: value.search,
              limit: value.limit,
            },
            options,
          )
          return { data: (result.data ?? []).map(sessionInfo), cursor: {} as { next?: string } }
        }
        const result = await legacy({ directory: value?.directory }).session.list({
          directory: value?.directory,
          roots: value?.parentID === null ? true : undefined,
          search: value?.search,
          limit: value?.limit,
        })
        return { data: (result.data ?? []).map(sessionInfo), cursor: {} as { next?: string } }
      },
      async create(value?: { agent?: string; model?: ModelRef; location?: Location }) {
        const result = await legacy(value?.location).session.create({
          directory: directory(value?.location),
        })
        if (!result.data) throw new Error("Failed to create session")
        return sessionInfo(result.data)
      },
      async get(value: { sessionID: string }) {
        const result = await legacy().session.get(value)
        if (!result.data) throw new Error(`Session not found: ${value.sessionID}`)
        return sessionInfo(result.data)
      },
      async active() {
        const result = await legacy().session.status()
        return Object.fromEntries(
          Object.entries(result.data ?? {}).flatMap(([sessionID, status]) =>
            status.type === "idle" ? [] : [[sessionID, { type: "running" as const }]],
          ),
        )
      },
      async rename(value: { sessionID: string; title: string } & Location) {
        await legacy(value).session.update({ sessionID: value.sessionID, title: value.title })
      },
      async remove(value: { sessionID: string } & Location) {
        await legacy(value).session.delete({ sessionID: value.sessionID })
      },
      async fork(value: { sessionID: string; messageID?: string }) {
        const result = await legacy().session.fork(value)
        if (!result.data) throw new Error("Failed to fork session")
        return sessionInfo(result.data)
      },
      async interrupt(value: { sessionID: string }) {
        await legacy().session.abort(value)
      },
      async prompt(value: SessionPromptInput & LegacyPrompt) {
        await legacy().session.promptAsync({
          sessionID: value.sessionID,
          messageID: value.id,
          agent: value.agent,
          model: value.model,
          variant: value.variant,
          parts: value.legacyParts ?? [
            { type: "text", text: value.text },
            ...(value.files ?? []).map((file) => ({
              type: "file" as const,
              mime: file.mention ? "text/plain" : mime(file.uri),
              url: file.uri,
              filename: file.name,
              source: file.mention
                ? {
                    type: "file" as const,
                    text: { value: file.mention.text, start: file.mention.start, end: file.mention.end },
                    path: file.uri,
                  }
                : undefined,
            })),
            ...(value.agents ?? []).map((agent) => ({
              type: "agent" as const,
              name: agent.name,
              source: agent.mention
                ? { value: agent.mention.text, start: agent.mention.start, end: agent.mention.end }
                : undefined,
            })),
          ],
        })
      },
      async command(value: {
        sessionID: string
        id?: string
        command: string
        arguments?: string
        agent?: string
        model?: ModelRef
        files?: { uri: string; name?: string }[]
      }) {
        await legacy().session.command({
          sessionID: value.sessionID,
          messageID: value.id,
          command: value.command,
          arguments: value.arguments ?? "",
          agent: value.agent,
          model: value.model ? `${value.model.providerID}/${value.model.id}` : undefined,
          variant: value.model?.variant,
          parts: value.files?.map((file) => ({
            type: "file" as const,
            mime: mime(file.uri),
            url: file.uri,
            filename: file.name,
          })),
        })
      },
      async shell(value: { sessionID: string; id?: string; command: string } & LegacyPrompt) {
        await legacy().session.shell({
          sessionID: value.sessionID,
          command: value.command,
          agent: value.agent,
          model: value.model,
        })
      },
      async compact(value: { sessionID: string; model: { providerID: string; modelID: string } }) {
        await legacy().session.summarize({
          sessionID: value.sessionID,
          providerID: value.model.providerID,
          modelID: value.model.modelID,
        })
      },
      revert: {
        stage: async (value: { sessionID: string; messageID: string }) => {
          await legacy().session.revert(value)
          return { messageID: value.messageID }
        },
        clear: async (value: { sessionID: string }) => {
          await legacy().session.unrevert(value)
        },
        commit: (value: SessionsCommitInput) => input.current.sessions.commit(value),
      },
    },
    project: {
      async list() {
        return (await legacy().project.list()).data ?? []
      },
      async current(value?: { location?: Location }) {
        const result = await legacy(value?.location).project.current()
        if (!result.data) throw new Error("Project not found")
        return { id: result.data.id, directory: result.data.worktree }
      },
      async directories(value: { projectID: string; location?: Location }) {
        const result = await legacy(value.location).worktree.list()
        return (result.data ?? []).map((item) => ({ directory: item }))
      },
    },
    vcs: {
      async status(value?: { location?: Location }) {
        const result = await legacy(value?.location).vcs.status()
        return located(result.data ?? [], value?.location)
      },
      async diff(value: { location?: Location; mode: "working" | "branch"; context?: number }) {
        const result = await legacy(value.location).vcs.diff({
          mode: value.mode === "working" ? "git" : value.mode,
          context: value.context,
        })
        return located(
          (result.data ?? []).map((file) => ({
            file: file.file,
            patch: file.patch ?? "",
            additions: file.additions,
            deletions: file.deletions,
            status: file.status ?? "modified",
          })),
          value.location,
        )
      },
    },
    file: {
      async list(value?: { location?: Location; path?: string }) {
        const result = await legacy(value?.location).file.list({ path: value?.path ?? "" })
        return located(result.data ?? [], value?.location)
      },
      async find(
        value: { location?: Location; query: string; type?: "file" | "directory"; limit?: number },
        options?: { signal?: AbortSignal },
      ) {
        const result = await legacy(value.location).find.files(
          {
            query: value.query,
            dirs: value.type === undefined ? undefined : value.type === "directory" ? "true" : "false",
            limit: value.limit,
          },
          options,
        )
        return located(
          (result.data ?? []).map((path) => ({ path, type: value.type ?? "file" })),
          value.location,
        )
      },
    },
    integration: {
      async get(value: { integrationID: string; location?: Location }): Promise<IntegrationsGetOutput> {
        const methods = ((await legacy(value.location).provider.auth()).data?.[value.integrationID] ?? []).map(
          (method, index) =>
            method.type === "api"
              ? { type: "key" as const, label: method.label }
              : { type: "oauth" as const, id: String(index), label: method.label, prompts: method.prompts },
        )
        return located({ id: value.integrationID, name: value.integrationID, methods, connections: [] }, value.location)
      },
      connect: {
        key: async (value: { integrationID: string; key: string; location?: Location }) => {
          await legacy(value.location).auth.set({
            providerID: value.integrationID,
            auth: { type: "api", key: value.key },
          })
          await legacy(value.location).instance.dispose()
          await input.legacy().instance.dispose()
        },
      },
      oauth: {
        connect: async (value: {
          integrationID: string
          methodID: string
          inputs?: Record<string, string>
          location?: Location
        }): Promise<IntegrationsConnectOauthOutput> => {
          const method = Number(value.methodID)
          const result = await legacy(value.location).provider.oauth.authorize(
            { providerID: value.integrationID, method, inputs: value.inputs },
            { throwOnError: true },
          )
          if (!result.data) throw new Error("Failed to start OAuth authorization")
          return located(
            {
              attemptID: `${value.integrationID}:${method}`,
              url: result.data.url,
              instructions: result.data.instructions,
              mode: result.data.method,
              time: { created: Date.now(), expires: Date.now() + 10 * 60 * 1000 },
            },
            value.location,
          )
        },
        complete: async (value: { integrationID: string; attemptID: string; code?: string; location?: Location }) => {
          const method = Number(value.attemptID.split(":").at(-1))
          await legacy(value.location).provider.oauth.callback(
            { providerID: value.integrationID, method, code: value.code },
            { throwOnError: true },
          )
          await legacy(value.location).instance.dispose()
          await input.legacy().instance.dispose()
        },
        status: async (value: {
          integrationID: string
          attemptID: string
          location?: Location
        }): Promise<IntegrationsAttemptStatusOutput> => {
          const method = Number(value.attemptID.split(":").at(-1))
          await legacy(value.location).provider.oauth.callback(
            { providerID: value.integrationID, method },
            { throwOnError: true },
          )
          await legacy(value.location).instance.dispose()
          await input.legacy().instance.dispose()
          return located(
            { status: "complete" as const, time: { created: Date.now(), expires: Date.now() } },
            value.location,
          )
        },
      },
    },
    pty: {
      async list(value?: { location?: Location }) {
        return located((await legacy(value?.location).pty.list()).data ?? [], value?.location)
      },
      async create(value?: {
        location?: Location
        command?: string
        args?: readonly string[]
        cwd?: string
        title?: string
        env?: Record<string, string>
      }) {
        const result = await legacy(value?.location).pty.create({
          command: value?.command,
          args: value?.args ? [...value.args] : undefined,
          cwd: value?.cwd,
          title: value?.title,
          env: value?.env,
        })
        if (!result.data) throw new Error("Failed to create terminal")
        return located(result.data, value?.location)
      },
      async get(value: { ptyID: string; location?: Location }) {
        const result = await legacy(value.location).pty.get({ ptyID: value.ptyID })
        if (!result.data) throw new Error(`Terminal not found: ${value.ptyID}`)
        return located(result.data, value.location)
      },
      async update(value: {
        ptyID: string
        location?: Location
        title?: string
        size?: { rows: number; cols: number }
      }) {
        const result = await legacy(value.location).pty.update({
          ptyID: value.ptyID,
          title: value.title,
          size: value.size,
        })
        if (!result.data) throw new Error(`Terminal not found: ${value.ptyID}`)
        return located(result.data, value.location)
      },
      async remove(value: { ptyID: string; location?: Location }) {
        await legacy(value.location).pty.remove({ ptyID: value.ptyID })
      },
    },
    permission: {
      async reply(value: {
        sessionID: string
        requestID: string
        reply: "once" | "always" | "reject"
        location?: Location
      }) {
        await legacy(value.location).permission.respond({
          sessionID: value.sessionID,
          permissionID: value.requestID,
          response: value.reply,
          directory: directory(value.location),
        })
      },
    },
    question: {
      async reply(value: { sessionID: string; requestID: string; answers: readonly (readonly string[])[] }) {
        await legacy().question.reply({
          requestID: value.requestID,
          answers: value.answers.map((answer) => [...answer]),
        })
      },
      async reject(value: { sessionID: string; requestID: string }) {
        await legacy().question.reject({ requestID: value.requestID })
      },
    },
  }
}
