import { LayerNode } from "@dev-ai/core/effect/layer-node"
import path from "path"
import { Effect, Layer, Context, Schema } from "effect"
import { NamedError } from "@dev-ai/core/util/error"
import type { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { Global } from "@dev-ai/core/global"
import { SkillPlugin } from "@dev-ai/core/plugin/skill"
import { Permission } from "@/permission"
import { FSUtil } from "@dev-ai/core/fs-util"
import { Config } from "@/config/config"
import { FrontmatterError } from "@dev-ai/core/v1/config/error"
import { ConfigMarkdown } from "@/config/markdown"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Glob } from "@dev-ai/core/util/glob"
import { Discovery } from "./discovery"
import { isRecord } from "@/util/record"
import { escapeHtml } from "@/util/html"

const CLAUDE_EXTERNAL_DIR = ".claude"
const AGENTS_EXTERNAL_DIR = ".agents"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const DEV_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"

// Built-in skill that ships with devcode. The model's intuition for what an
// dev.json should look like is often wrong, and devcode hard-fails on
// invalid config, so users hit cryptic startup errors. Loading this skill
// when the model is asked to touch devcode's own config files gives it the
// actual schemas instead of guesses.
const CUSTOMIZE_DEV_SKILL_NAME = "customize-devcode"
const CUSTOMIZE_DEV_SKILL_DESCRIPTION =
  "Use ONLY when the user is editing or creating devcode's own configuration: dev.json, dev.jsonc, files under .dev/, or files under ~/.config/devcode/. Also use when creating or fixing devcode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring devcode itself."
const CUSTOMIZE_DEV_SKILL_BODY = SkillPlugin.CustomizeDevcodeContent

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
  // Options from the common SKILL.md format, so skills written for other agents behave the same in DeV.
  /** Shown while typing the slash command, e.g. "[issue-number]". */
  argumentHint: Schema.optional(Schema.String),
  /** Names for positional arguments, used as $name. */
  arguments: Schema.optional(Schema.Array(Schema.String)),
  /** false: only DeV may load it ("user-invocable: false"), so it's not in the slash menu. */
  userInvocable: Schema.optional(Schema.Boolean),
  /** false: only the person may start it ("disable-model-invocation: true"). */
  modelInvocable: Schema.optional(Schema.Boolean),
  /** "context: fork": run in a subagent of this type. */
  fork: Schema.optional(Schema.String),
  /** The installed plugin it came from; its folder is ${CLAUDE_PLUGIN_ROOT}. */
  plugin: Schema.optional(Schema.Struct({ name: Schema.String, root: Schema.String, data: Schema.String })),
})
export type Info = Schema.Schema.Type<typeof Info>

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

function isSkillFrontmatter(data: unknown): data is { name: string; description?: string } {
  return (
    isRecord(data) &&
    typeof data.name === "string" &&
    (data.description === undefined || typeof data.description === "string")
  )
}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("SkillInvalidError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Issue)),
}) {}

export class NameMismatchError extends Schema.TaggedErrorClass<NameMismatchError>()("SkillNameMismatchError", {
  path: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Skill.NotFoundError", {
  name: Schema.String,
  available: Schema.Array(Schema.String),
}) {
  override get message() {
    return `Skill "${this.name}" not found. Available skills: ${this.available.join(", ") || "none"}`
  }
}

type State = {
  skills: Record<string, Info>
  dirs: Set<string>
}

type Plugin = { name: string; root: string; data: string }

type DiscoveryState = {
  matches: string[]
  dirs: string[]
  plugins: Plugin[]
}

type ScanState = {
  matches: Set<string>
  dirs: Set<string>
}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly require: (name: string) => Effect.Effect<Info, NotFoundError>
  readonly all: () => Effect.Effect<Info[]>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
}

const add = Effect.fnUntraced(function* (
  state: State,
  match: string,
  plugins: Plugin[],
  events: EventV2Bridge.Service["Service"],
) {
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: (err) => err,
  }).pipe(
    Effect.catch(
      Effect.fnUntraced(function* (err) {
        const message = FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse skill ${match}`
        const { Session } = yield* Effect.promise(() => import("@/session/session"))
        yield* events.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        yield* Effect.logError("failed to load skill", { skill: match, error: err })
        return undefined
      }),
    ),
  )

  if (!md) return

  if (!isSkillFrontmatter(md.data)) return
  const data = md.data as Record<string, unknown>
  const plugin = plugins.find((item) => match.startsWith(item.root + path.sep))
  // Plugin skills are named plugin:skill, which is also how other skills refer to them.
  // Its folder gives the second half ("Agent Cost Report" in agent-cost-report/ is plugin:agent-cost-report).
  const name = plugin ? `${plugin.name}:${path.basename(path.dirname(match))}` : md.data.name

  if (state.skills[name]) {
    yield* Effect.logWarning("duplicate skill name", {
      name,
      existing: state.skills[name].location,
      duplicate: match,
    })
  }

  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : undefined)
  const description = [md.data.description, text("when_to_use")].filter(Boolean).join(" ") || undefined
  const named = Array.isArray(data.arguments)
    ? data.arguments.filter((item): item is string => typeof item === "string")
    : text("arguments")?.split(/\s+/).filter(Boolean)
  state.dirs.add(path.dirname(match))
  state.skills[name] = {
    name,
    description,
    location: match,
    content: md.content,
    argumentHint: text("argument-hint"),
    arguments: named,
    userInvocable: data["user-invocable"] === false ? false : undefined,
    modelInvocable: data["disable-model-invocation"] === true ? false : undefined,
    fork: data.context === "fork" ? (text("agent") ?? "general-purpose") : undefined,
    plugin,
  }
})

const scan = Effect.fnUntraced(function* (
  state: ScanState,
  root: string,
  pattern: string,
  opts?: { dot?: boolean; scope?: string },
) {
  const matches = yield* Effect.tryPromise({
    try: () =>
      Glob.scan(pattern, {
        cwd: root,
        absolute: true,
        include: "file",
        symlink: true,
        dot: opts?.dot,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) => {
      if (!opts?.scope) return Effect.die(error)
      return Effect.logError(`failed to scan ${opts.scope} skills`, { dir: root, error: error }).pipe(
        Effect.as([] as string[]),
      )
    }),
  )

  for (const match of matches) {
    state.matches.add(match)
    state.dirs.add(path.dirname(match))
  }
})

const discoverSkills = Effect.fnUntraced(function* (
  config: Config.Interface,
  discovery: Discovery.Interface,
  fsys: FSUtil.Interface,
  global: Global.Interface,
  disableExternalSkills: boolean,
  disableClaudeFolderSkills: boolean,
  directory: string,
  worktree: string,
) {
  const state: ScanState = { matches: new Set(), dirs: new Set() }

  const externalDirs: string[] = []
  const plugins: Plugin[] = []
  if (!disableExternalSkills) {
    if (!disableClaudeFolderSkills) externalDirs.push(CLAUDE_EXTERNAL_DIR)
    externalDirs.push(AGENTS_EXTERNAL_DIR)

    // Skills already in a ~/.claude folder (moved by CLAUDE_CONFIG_DIR) are picked up too.
    const claude = disableClaudeFolderSkills ? [] : claudeConfigDirs(global.home)
    const roots = [...new Set([...externalDirs.map((dir) => path.join(global.home, dir)), ...claude.slice(1)])]
    for (const root of roots) {
      if (!(yield* fsys.isDir(root))) continue
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
    }

    // Skills from plugins already installed and enabled in that folder.
    for (const root of claude) {
      for (const plugin of yield* Effect.promise(() => claudePlugins(root, directory))) {
        if (plugins.some((item) => item.root === plugin.root)) continue
        plugins.push(plugin)
        yield* scan(state, plugin.root, "skills/*/SKILL.md", { dot: true, scope: "plugin" })
      }
    }

    const upDirs = yield* fsys
      .up({ targets: externalDirs, start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const root of upDirs) {
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "project" })
    }
  }

  const configDirs = yield* config.directories()
  for (const dir of configDirs) {
    yield* scan(state, dir, DEV_SKILL_PATTERN)
  }

  const cfg = yield* config.get()
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    if (!(yield* fsys.isDir(dir))) {
      yield* Effect.logWarning("skill path not found", { path: dir })
      continue
    }

    yield* scan(state, dir, SKILL_PATTERN)
  }

  for (const url of cfg.skills?.urls ?? []) {
    const pulledDirs = yield* discovery.pull(url)
    for (const dir of pulledDirs) {
      yield* scan(state, dir, SKILL_PATTERN)
    }
  }

  return {
    matches: Array.from(state.matches),
    dirs: Array.from(state.dirs),
    plugins,
  }
})

/** Existing ~/.claude config folders: ~/.claude, then CLAUDE_CONFIG_DIR when it points elsewhere. */
function claudeConfigDirs(home: string) {
  const own = process.env.CLAUDE_CONFIG_DIR?.replace(/^~(?=\/|$)/, home)
  return [...new Set([path.join(home, CLAUDE_EXTERNAL_DIR), ...(own ? [path.resolve(own)] : [])])]
}

/** Enabled plugins in such a folder, from installed_plugins.json and settings.json. */
async function claudePlugins(root: string, directory: string): Promise<Plugin[]> {
  const read = (file: string) =>
    Bun.file(path.join(root, file))
      .json()
      .catch(() => undefined) as Promise<Record<string, any> | undefined>
  const [installed, settings] = await Promise.all([read("plugins/installed_plugins.json"), read("settings.json")])
  const enabled = settings?.enabledPlugins ?? {}
  return Object.entries((installed?.plugins ?? {}) as Record<string, any[]>).flatMap(([id, installs]) => {
    if (enabled[id] !== true || !Array.isArray(installs)) return []
    // A project install applies inside that project; a user install everywhere.
    const install =
      installs.find((item) => item?.scope === "project" && directory.startsWith(item.projectPath ?? "\0")) ??
      installs.find((item) => item?.scope === "user")
    if (typeof install?.installPath !== "string") return []
    return [
      {
        name: id.split("@")[0]!,
        root: install.installPath,
        data: path.join(root, "plugins", "data", id.replace(/[^a-zA-Z0-9_-]/g, "-")),
      },
    ]
  })
}

const loadSkills = Effect.fnUntraced(function* (
  state: State,
  discovered: DiscoveryState,
  events: EventV2Bridge.Service["Service"],
) {
  yield* Effect.forEach(discovered.matches, (match) => add(state, match, discovered.plugins, events), {
    concurrency: "unbounded",
    discard: true,
  })
  // DeV ships some plugins (superpowers, ponytail) itself; another copy of the same skill would repeat it.
  for (const skill of Object.values(state.skills))
    if (skill.plugin && state.skills[skill.name.slice(skill.plugin.name.length + 1)]) delete state.skills[skill.name]

  yield* Effect.logInfo("init", { count: Object.keys(state.skills).length })
})

export class Service extends Context.Service<Service, Interface>()("@dev-ai/Skill") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const discovery = yield* Discovery.Service
    const config = yield* Config.Service
    const events = yield* EventV2Bridge.Service
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service
    const flags = yield* RuntimeFlags.Service
    const discovered = yield* InstanceState.make(
      Effect.fn("Skill.discovery")(function* (ctx) {
        return yield* discoverSkills(
          config,
          discovery,
          fsys,
          global,
          flags.disableExternalSkills,
          flags.disableClaudeFolderSkills,
          ctx.directory,
          ctx.worktree,
        )
      }),
    )
    const state = yield* InstanceState.make(
      Effect.fn("Skill.state")(function* () {
        const s: State = { skills: {}, dirs: new Set() }
        // Register the built-in skill BEFORE disk discovery so a user-disk
        // skill with the same name can override it.
        s.skills[CUSTOMIZE_DEV_SKILL_NAME] = {
          name: CUSTOMIZE_DEV_SKILL_NAME,
          description: CUSTOMIZE_DEV_SKILL_DESCRIPTION,
          location: "<built-in>",
          content: CUSTOMIZE_DEV_SKILL_BODY,
        }
        yield* loadSkills(s, yield* InstanceState.get(discovered), events)
        return s
      }),
    )

    const get = Effect.fn("Skill.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.skills[name]
    })

    const require = Effect.fn("Skill.require")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      const info = s.skills[name]
      if (info) return info
      return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
    })

    const all = Effect.fn("Skill.all")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.skills)
    })

    const dirs = Effect.fn("Skill.dirs")(function* () {
      return (yield* InstanceState.get(discovered)).dirs
    })

    const available = Effect.fn("Skill.available")(function* (agent?: Agent.Info) {
      const s = yield* InstanceState.get(state)
      const list = Object.values(s.skills)
        .filter((skill) => skill.modelInvocable !== false)
        .toSorted((a, b) => a.name.localeCompare(b.name))
      if (!agent) return list
      return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
    })

    return Service.of({ get, require, all, dirs, available })
  }),
)

/**
 * A skill's text with its placeholders filled in: its folders, the project and session, and the
 * arguments typed after /skill-name (0-based $0 / $ARGUMENTS[0], named $name, all of them as $ARGUMENTS).
 * A $N no argument fills stays as written, so shell snippets like awk '{print $1}' survive.
 */
export function render(skill: Info, input: { project: string; sessionID?: string; arguments?: string }) {
  const dir = skill.location === "<built-in>" ? undefined : path.dirname(skill.location)
  const vars: Record<string, string | undefined> = {
    CLAUDE_SKILL_DIR: dir,
    CLAUDE_PLUGIN_ROOT: skill.plugin?.root,
    CLAUDE_PLUGIN_DATA: skill.plugin?.data,
    CLAUDE_PROJECT_DIR: input.project,
    CLAUDE_SESSION_ID: input.sessionID,
  }
  const filled = skill.content.replace(
    /\$\{(CLAUDE_[A-Z_]+)\}|\$(CLAUDE_[A-Z_]+)\b/g,
    (whole, braced, bare) => vars[braced ?? bare] ?? whole,
  )
  if (input.arguments === undefined) return filled
  const args = [...input.arguments.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!)
  const used = { any: false }
  const out = filled
    .replace(/\\\$/g, "\u0000")
    .replace(/\$ARGUMENTS\[(\d+)\]|\$(\d+)\b/g, (whole, a, b) => {
      const value = args[Number(a ?? b)]
      if (value === undefined) return whole
      used.any = true
      return value
    })
    .replace(/\$ARGUMENTS\b/g, () => ((used.any = true), input.arguments!))
    .replace(/\$([a-zA-Z_][\w-]*)/g, (whole, key: string) => {
      const index = skill.arguments?.indexOf(key) ?? -1
      if (index < 0) return whole
      used.any = true
      return args[index] ?? ""
    })
    .replace(/\u0000/g, "$")
  return used.any || !input.arguments.trim() ? out : `${out}\n\nARGUMENTS: ${input.arguments}`
}

export function fmt(list: Info[], opts: { verbose: boolean }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  if (opts.verbose) {
    return [
      "<available_skills>",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${escapeHtml(skill.location)}</location>`,
          "  </skill>",
        ]),
      "</available_skills>",
    ].join("\n")
  }

  return [
    "## Available Skills",
    ...described
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- **${skill.name}**: ${skill.description}`),
  ].join("\n")
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Discovery.node, Config.node, EventV2Bridge.node, FSUtil.node, Global.node, RuntimeFlags.node],
})

export * as Skill from "."
