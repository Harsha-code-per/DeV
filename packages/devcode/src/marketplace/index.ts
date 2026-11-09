// Plugin marketplaces. A marketplace is a git repo (or folder, or URL) with a marketplace.json listing
// plugins; a plugin is a folder of skills, commands, agents, hooks and MCP servers. The layout is the
// common open plugin format, so plugins published for other agents install unchanged.
//
// Storage, all under DeV's data folder:
//   plugins/known_marketplaces.json   marketplaces added on this machine
//   plugins/marketplaces/<name>/      their clones
//   plugins/installed_plugins.json    installed plugins: where, which version and commit
//   plugins/cache/<market>/<plugin>/<version>/   the installed files (${CLAUDE_PLUGIN_ROOT})
//   plugins/data/<id>/                state a plugin keeps across updates (${CLAUDE_PLUGIN_DATA})
// Whether a plugin is on is config: "enabled_plugins" in the user, project or local (dev.local.json) file.

import path from "path"
import fs from "fs/promises"
import { applyEdits, modify, parse } from "jsonc-parser"
import { Global } from "@dev-ai/core/global"
import { Brand } from "@dev-ai/core/brand"
import { Process } from "@/util/process"
import { ConfigCommand } from "@/config/command"
import { ConfigAgent } from "@/config/agent"
import DevDefaults from "@/config/dev-defaults.json"
import { ConfigPlugin } from "@/config/plugin"
import type { ConfigPluginV1 } from "@dev-ai/core/v1/config/plugin"
import { Flag } from "@dev-ai/core/flag/flag"
import { parsePluginSpecifier } from "@/plugin/shared"

export type Scope = "user" | "project" | "local"

export type PluginSource =
  | string
  | { source: "github"; repo: string; ref?: string; sha?: string }
  | { source: "url"; url: string; ref?: string; sha?: string }
  | { source: "git-subdir"; url: string; path: string; ref?: string; sha?: string }
  | { source: string; [key: string]: unknown }

export type Entry = {
  name: string
  marketplace: string
  description?: string
  version?: string
  category?: string
  tags?: string[]
  keywords?: string[]
  homepage?: string
  repository?: string
  license?: string
  author?: { name?: string }
  source: PluginSource
  /** Free-form; DeV's index puts stars, kind ("plugin", "skill", "mcp"), verified and needed env vars here. */
  metadata?: Record<string, any>
}

export type Marketplace = {
  name: string
  source: string
  root: string
  description?: string
  owner?: { name?: string }
  plugins: Entry[]
}

export type Installed = { installPath: string; version: string; sha?: string; installedAt: string }

/** An installed and enabled plugin, as the loaders need it. */
export type Plugin = { id: string; name: string; marketplace: string; root: string; data: string }

const MANIFEST_DIRS = [".dev-plugin", ".claude-plugin"]
const NAME = /^[a-zA-Z0-9][\w.-]*$/

const root = () => path.join(Global.Path.data, "plugins")
const knownFile = () => path.join(root(), "known_marketplaces.json")
const installedFile = () => path.join(root(), "installed_plugins.json")

// ---------- marketplaces ----------

/** Adds a marketplace from owner/repo[#ref], a git URL, a URL to marketplace.json, or a folder. */
export async function addMarketplace(input: string, cwd = process.cwd()) {
  const source = normalize(input, cwd)
  const staging = path.join(root(), "marketplaces", `.adding-${process.pid}-${Date.now()}`)
  await fs.rm(staging, { recursive: true, force: true })
  try {
    const location = await fetchMarketplace(source, staging)
    const manifest = await readMarketplaceFile(location)
    const name = String(manifest.name ?? "")
    if (!NAME.test(name) || name.includes("..")) throw new Error(`"${name}" is not a valid marketplace name`)
    const known = await readJson<Record<string, { source: string; installLocation: string; lastUpdated: string }>>(
      knownFile(),
      {},
    )
    if (known[name] && known[name].source !== source)
      throw new Error(`A marketplace named "${name}" is already added from ${known[name].source}`)
    const installLocation = location === staging ? path.join(root(), "marketplaces", name) : location
    if (location === staging) {
      await fs.rm(installLocation, { recursive: true, force: true })
      await fs.rename(staging, installLocation)
    }
    known[name] = { source, installLocation, lastUpdated: new Date().toISOString() }
    await writeJson(knownFile(), known)
    return (await marketplace(name))!
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}

export async function marketplaces(): Promise<Marketplace[]> {
  const known = await readJson<Record<string, { source: string }>>(knownFile(), {})
  const list = await Promise.all(Object.keys(known).map((name) => marketplace(name).catch(() => undefined)))
  return list.filter((item): item is Marketplace => item !== undefined)
}

export async function marketplace(name: string): Promise<Marketplace | undefined> {
  const known = await readJson<Record<string, { source: string; installLocation: string }>>(knownFile(), {})
  const item = known[name]
  if (!item) return undefined
  const manifest = await readMarketplaceFile(item.installLocation)
  const plugins = (Array.isArray(manifest.plugins) ? manifest.plugins : [])
    .filter((entry: any) => entry && typeof entry.name === "string" && NAME.test(entry.name) && entry.source)
    .map((entry: any) => ({ ...entry, marketplace: name }) as Entry)
  return {
    name,
    source: item.source,
    root: item.installLocation,
    description: manifest.description ?? manifest.metadata?.description,
    owner: manifest.owner,
    plugins,
  }
}

/** Fetches the latest version of a marketplace's list. */
export async function updateMarketplace(name: string) {
  const known = await readJson<Record<string, { source: string; installLocation: string; lastUpdated: string }>>(
    knownFile(),
    {},
  )
  const item = known[name]
  if (!item) throw new Error(`No marketplace named "${name}"`)
  if (item.installLocation.startsWith(path.join(root(), "marketplaces"))) {
    const staging = `${item.installLocation}.updating-${process.pid}`
    await fs.rm(staging, { recursive: true, force: true })
    await fetchMarketplace(item.source, staging)
    await fs.rm(item.installLocation, { recursive: true, force: true })
    await fs.rename(staging, item.installLocation)
  }
  known[name] = { ...item, lastUpdated: new Date().toISOString() }
  await writeJson(knownFile(), known)
  return (await marketplace(name))!
}

/** Removes a marketplace and the plugins installed from it. */
export async function removeMarketplace(name: string) {
  const known = await readJson<Record<string, { installLocation: string }>>(knownFile(), {})
  const item = known[name]
  if (!item) throw new Error(`No marketplace named "${name}"`)
  const installed = await readInstalled()
  for (const id of Object.keys(installed).filter((id) => id.endsWith(`@${name}`))) {
    await fs.rm(installed[id]!.installPath, { recursive: true, force: true })
    delete installed[id]
  }
  await writeJson(installedFile(), { version: 1, plugins: installed })
  if (item.installLocation.startsWith(path.join(root(), "marketplaces")))
    await fs.rm(item.installLocation, { recursive: true, force: true })
  delete known[name]
  await writeJson(knownFile(), known)
}

/**
 * Adds the marketplaces config names (DeV's own index by default, or a team's in .dev/dev.json) that this machine
 * hasn't fetched yet, and refreshes any older than a day in the background.
 */
export async function ensure(configured: Record<string, { source: string }> | undefined, cwd: string) {
  const known = await readJson<Record<string, { source: string; lastUpdated: string }>>(knownFile(), {})
  for (const item of Object.values(configured ?? {})) {
    // An empty source turns a declared marketplace off, e.g. "marketplaces": { "dev": { "source": "" } }.
    if (!item?.source?.trim()) continue
    const source = normalize(item.source, cwd)
    const existing = Object.entries(known).find(([, value]) => value.source === source)
    if (!existing) {
      await addMarketplace(source, cwd).catch(() => undefined)
      continue
    }
    if (Date.now() - Date.parse(existing[1].lastUpdated) > 86_400_000)
      void updateMarketplace(existing[0]).catch(() => undefined)
  }
}

/** ensure() for the command line, which has no loaded config: DeV's defaults plus the three scope files. */
export async function ensureFromFiles(project: string) {
  const layers = await Promise.all((["user", "project", "local"] as const).map((scope) => readConfig(scope, project)))
  const configured = Object.assign(
    {},
    DevDefaults.marketplaces as Record<string, { source: string }>,
    ...layers.map((layer) => (layer as { marketplaces?: Record<string, { source: string }> }).marketplaces ?? {}),
  )
  await ensure(configured, project)
}

/** Every plugin in every added marketplace. */
export async function entries() {
  return (await marketplaces()).flatMap((item) => item.plugins)
}

// ---------- plugins ----------

/** Installs plugin@marketplace (or a plugin name found in exactly one marketplace) and turns it on in a scope. */
export async function install(id: string, scope: Scope, project: string) {
  const entry = await find(id)
  const full = `${entry.name}@${entry.marketplace}`
  const market = (await marketplace(entry.marketplace))!
  const fetched = await fetchPlugin(entry, market)
  try {
    const manifest = await readPluginManifest(fetched.dir)
    const version = String(manifest?.version ?? entry.version ?? fetched.sha?.slice(0, 12) ?? "unknown").replace(
      /[^\w.+-]/g,
      "-",
    )
    const installPath = path.join(root(), "cache", entry.marketplace, entry.name, version)
    await fs.rm(installPath, { recursive: true, force: true })
    await fs.mkdir(path.dirname(installPath), { recursive: true })
    await fs.cp(fetched.dir, installPath, { recursive: true })
    await fs.rm(path.join(installPath, ".git"), { recursive: true, force: true })
    const installed = await readInstalled()
    const previous = installed[full]
    installed[full] = { installPath, version, sha: fetched.sha, installedAt: new Date().toISOString() }
    await writeJson(installedFile(), { version: 1, plugins: installed })
    if (previous && previous.installPath !== installPath)
      await fs.rm(previous.installPath, { recursive: true, force: true })
    await setEnabled(full, scope, project, true)
    return { id: full, version, installPath, contents: await contents(installPath) }
  } finally {
    await fetched.cleanup()
  }
}

/** Turns a plugin off in a scope; removes its files when no scope uses it any more. */
export async function uninstall(id: string, scope: Scope, project: string) {
  const full = await resolveId(id)
  await editConfig(scope, project, ["enabled_plugins", full], undefined)
  const users = await Promise.all(
    (["user", "project", "local"] as const).map(
      async (item) => (await readConfig(item, project)).enabled_plugins?.[full],
    ),
  )
  if (users.every((value) => value === undefined)) {
    const installed = await readInstalled()
    if (installed[full]) await fs.rm(installed[full]!.installPath, { recursive: true, force: true })
    delete installed[full]
    await writeJson(installedFile(), { version: 1, plugins: installed })
  }
  return full
}

export async function setEnabled(id: string, scope: Scope, project: string, enabled: boolean) {
  const code = (await codePlugins(project)).some((item) => item.id === id)
  const full = code ? id : await resolveId(id)
  await editConfig(scope, project, ["enabled_plugins", full], enabled)
  return full
}

/** Reinstalls a plugin from its marketplace's current list, when its version or commit changed. */
export async function update(id: string, project: string) {
  const full = await resolveId(id)
  const before = (await readInstalled())[full]
  // The scope stays as it was: install() rewrites the same enabled flag.
  const scope = (await scopeOf(full, project)) ?? "user"
  const after = await install(full, scope, project)
  return { id: full, from: before?.version, to: after.version }
}

/**
 * Code plugins (npm or git packages listed under `plugin`, DeV's built-ins included). Config layers only add to that
 * list, so each is switched off by its short name in enabled_plugins, and is on unless a scope says false.
 */
export async function codePlugins(project: string) {
  const order = ["user", "project", "local"] as const
  const layers = await Promise.all(order.map((scope) => readConfig(scope, project)))
  const specs = [...(Flag.DEV_DISABLE_BUNDLED_DEFAULTS ? [] : DevDefaults.plugin), ...layers.flatMap((layer) => layer.plugin ?? [])]
  const named = new Map(specs.map((spec) => [ConfigPlugin.pluginNames(spec).at(-1)!, spec]))
  return [...named].map(([id, spec]) => ({
    id,
    version: parsePluginSpecifier(ConfigPlugin.pluginSpecifier(spec)).version,
    enabled: layers.reduce<boolean | undefined>((value, layer) => layer.enabled_plugins?.[id] ?? value, undefined) !== false,
    scope: order.findLast((_, index) => layers[index]?.enabled_plugins?.[id] !== undefined),
    kind: "code",
    installPath: "",
    installedAt: "",
  }))
}

/** Installed plugins with where they're on, for listings. */
export async function installed(project: string) {
  const list = await readInstalled()
  const order = ["user", "project", "local"] as const
  const layers = await Promise.all(order.map(async (scope) => (await readConfig(scope, project)).enabled_plugins))
  return Object.entries(list).map(([id, item]) => ({
    id,
    ...item,
    enabled: effective(id, layers),
    // The most specific scope that mentions it.
    scope: order.findLast((_, index) => layers[index]?.[id] !== undefined),
  }))
}

/**
 * Plugins to load, from the merged config's enabled_plugins. A plugin turned on in a project file but not yet
 * installed on this machine is listed by `missing` so /plugins can offer to install it.
 */
export async function enabled(cfg: { enabled_plugins?: Record<string, boolean> }): Promise<Plugin[]> {
  const list = await readInstalled()
  return Object.entries(cfg.enabled_plugins ?? {}).flatMap(([id, on]) => {
    const item = list[id]
    if (!on || !item) return []
    const [name, market] = id.split("@") as [string, string]
    return [{ id, name, marketplace: market, root: item.installPath, data: dataDir(id) }]
  })
}

export async function missing(cfg: { enabled_plugins?: Record<string, boolean> }) {
  const list = await readInstalled()
  return Object.entries(cfg.enabled_plugins ?? {}).flatMap(([id, on]) => (on && !list[id] ? [id] : []))
}

export function dataDir(id: string) {
  return path.join(root(), "data", id.replace(/[^a-zA-Z0-9_-]/g, "-"))
}

// ---------- what a plugin brings ----------

/** A plugin's commands, agents, hooks and MCP servers, named plugin:name, with its folder variables filled in. */
export async function components(plugin: Plugin) {
  const manifest = (await readPluginManifest(plugin.root)) ?? {}
  const fill = (text: string) =>
    text
      .replace(/\$\{(?:CLAUDE|DEV)_PLUGIN_ROOT\}/g, plugin.root)
      .replace(/\$\{(?:CLAUDE|DEV)_PLUGIN_DATA\}/g, plugin.data)
  const prefix = (record: Record<string, any>) =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [`${plugin.name}:${key}`, value]))

  const commands = prefix(
    Object.fromEntries(
      Object.entries(await ConfigCommand.load(plugin.root).catch(() => ({}))).map(([key, value]) => [
        key,
        { ...value, template: fill(value.template), model: value.model?.includes("/") ? value.model : undefined },
      ]),
    ),
  )
  const agents = prefix(
    Object.fromEntries(
      Object.entries(await ConfigAgent.load(plugin.root).catch(() => ({}))).map(([key, value]) => [
        key,
        // Plugins often name a model by a short alias ("opus", "inherit"); without a provider/ it runs on the
        // session's own model instead of failing.
        {
          ...value,
          ...(value.prompt ? { prompt: fill(value.prompt) } : {}),
          model: value.model?.includes("/") ? value.model : undefined,
        },
      ]),
    ),
  )

  const hookFiles = [
    await readJson<any>(path.join(plugin.root, "hooks", "hooks.json"), undefined),
    ...(await Promise.all(
      listOf(manifest.hooks).map((item) =>
        typeof item === "string" ? readJson<any>(inside(plugin.root, item), undefined) : { hooks: item },
      ),
    )),
  ].filter(Boolean)
  const hooks: Record<string, any[]> = {}
  for (const file of hookFiles)
    for (const [event, matchers] of Object.entries((file.hooks ?? {}) as Record<string, any[]>)) {
      if (!Array.isArray(matchers)) continue
      const usable = matchers.flatMap((matcher) => {
        // DeV runs command and http hooks; other kinds are skipped.
        const list = (matcher?.hooks ?? [])
          .filter((hook: any) => hook?.type === "command" || hook?.type === "http")
          .map((hook: any) => (hook.type === "command" ? { ...hook, command: fill(hook.command) } : hook))
        return list.length > 0 ? [{ ...(matcher.matcher ? { matcher: matcher.matcher } : {}), hooks: list }] : []
      })
      if (usable.length > 0) hooks[event] = [...(hooks[event] ?? []), ...usable]
    }

  const serverFiles = [
    await readJson<any>(path.join(plugin.root, ".mcp.json"), undefined),
    ...(await Promise.all(
      listOf(manifest.mcpServers).map((item) =>
        typeof item === "string"
          ? item.endsWith(".json")
            ? readJson<any>(inside(plugin.root, item), undefined)
            : undefined
          : item,
      ),
    )),
  ].filter(Boolean)
  const mcp: Record<string, any> = {}
  for (const file of serverFiles)
    for (const [key, server] of Object.entries((file.mcpServers ?? file) as Record<string, any>)) {
      const converted = mcpServer(server, fill)
      if (converted) mcp[`${plugin.name}:${key}`] = converted
    }

  return { commands, agents, hooks, mcp }
}

/** What a plugin folder contains, shown before it's turned on. */
export async function contents(dir: string) {
  const count = async (pattern: string) =>
    (await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: dir, dot: true }))).length
  const plugin: Plugin = { id: "x@x", name: "x", marketplace: "x", root: dir, data: "" }
  const parts = await components(plugin)
  return {
    skills: (await count("skills/*/SKILL.md")) + (await count("SKILL.md")),
    commands: Object.keys(parts.commands).length,
    agents: Object.keys(parts.agents).length,
    hooks: Object.values(parts.hooks).reduce((sum, list) => sum + list.length, 0),
    mcp: Object.keys(parts.mcp).map((key) => key.slice(2)),
  }
}

// ---------- helpers ----------

function normalize(input: string, cwd: string) {
  const text = input.trim()
  if (/^(\.{1,2}\/|\/|~\/)/.test(text)) return path.resolve(cwd, text.replace(/^~(?=\/)/, Global.Path.home))
  return text
}

async function fetchMarketplace(source: string, staging: string) {
  if (path.isAbsolute(source)) {
    const stat = await fs.stat(source).catch(() => undefined)
    if (!stat) throw new Error(`${source} does not exist`)
    // A folder is used in place; a marketplace.json file stands for its folder.
    return stat.isDirectory() ? source : path.dirname(path.dirname(source))
  }
  if (/^https?:\/\/.+\.json(\?.*)?$/.test(source)) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`${source} answered ${response.status}`)
    await fs.mkdir(path.join(staging, ".dev-plugin"), { recursive: true })
    await Bun.write(path.join(staging, ".dev-plugin", "marketplace.json"), await response.text())
    return staging
  }
  const [url, ref] = gitUrl(source)
  await clone(url, ref, staging)
  return staging
}

/** owner/repo[#ref] or a git URL[#ref] → clone URL and ref. */
function gitUrl(source: string): [string, string | undefined] {
  const [base, ref] = source.split("#") as [string, string | undefined]
  if (/^[\w.-]+\/[\w.-]+$/.test(base)) return [`https://github.com/${base}.git`, ref]
  if (/^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/.test(base)) return [base, ref]
  throw new Error(`"${source}" is not owner/repo, a git URL, a URL to marketplace.json, or a folder`)
}

async function clone(url: string, ref: string | undefined, dest: string, sha?: string) {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  // Never prompt for a password: a private repo needs credentials git already has (SSH key or helper).
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" }
  if (sha) {
    await Process.run(["git", "init", "-q", dest], { env })
    await Process.run(["git", "-C", dest, "fetch", "-q", "--depth", "1", url, sha], { env })
    await Process.run(["git", "-C", dest, "-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"], { env })
    return
  }
  await Process.run(["git", "clone", "-q", "--depth", "1", ...(ref ? ["--branch", ref] : []), url, dest], { env })
}

async function head(dir: string) {
  const out = await Process.text(["git", "-C", dir, "rev-parse", "HEAD"], { nothrow: true })
  return /^[0-9a-f]{40}$/.test(out.text.trim()) ? out.text.trim() : undefined
}

async function fetchPlugin(entry: Entry, market: Marketplace) {
  const source = entry.source
  const none = async () => {}
  if (typeof source === "string") {
    const dir = inside(market.root, source)
    return { dir, sha: await head(market.root), cleanup: none }
  }
  const staging = path.join(root(), "cache", `.fetching-${process.pid}-${Date.now()}`)
  const cleanup = () => fs.rm(staging, { recursive: true, force: true })
  try {
    if (source.source === "github" && typeof source.repo === "string") {
      await clone(
        `https://github.com/${source.repo}.git`,
        source.ref as string | undefined,
        staging,
        source.sha as string | undefined,
      )
      return { dir: staging, sha: await head(staging), cleanup }
    }
    if (source.source === "url" && typeof source.url === "string") {
      await clone(source.url, source.ref as string | undefined, staging, source.sha as string | undefined)
      return { dir: staging, sha: await head(staging), cleanup }
    }
    if (source.source === "git-subdir" && typeof source.url === "string" && typeof source.path === "string") {
      const [url] = gitUrl(source.url)
      await clone(url, source.ref as string | undefined, staging, source.sha as string | undefined)
      return { dir: inside(staging, source.path), sha: await head(staging), cleanup }
    }
  } catch (error) {
    await cleanup()
    throw error
  }
  // ponytail: npm, archive and command sources come later; they're rare in public marketplaces.
  throw new Error(`${entry.name} uses a "${source.source}" source, which DeV can't install yet`)
}

async function find(id: string) {
  const [name, market] = id.split("@") as [string, string | undefined]
  const all = await entries()
  const matches = all.filter((entry) => entry.name === name && (!market || entry.marketplace === market))
  if (matches.length === 0)
    throw new Error(
      `No plugin "${id}" in your marketplaces. Add one with \`devcode plugin marketplace add <owner/repo>\`.`,
    )
  if (matches.length > 1)
    throw new Error(
      `"${name}" is in several marketplaces: ${matches.map((item) => `${name}@${item.marketplace}`).join(", ")}`,
    )
  return matches[0]!
}

async function resolveId(id: string) {
  if (id.includes("@")) return id
  const ids = Object.keys(await readInstalled()).filter((item) => item.startsWith(`${id}@`))
  if (ids.length === 1) return ids[0]!
  return `${(await find(id)).name}@${(await find(id)).marketplace}`
}

async function scopeOf(id: string, project: string) {
  for (const scope of ["local", "project", "user"] as const)
    if ((await readConfig(scope, project)).enabled_plugins?.[id] !== undefined) return scope
  return undefined
}

function effective(id: string, layers: (Record<string, boolean> | undefined)[]) {
  // user, project, local: the most specific scope that mentions the plugin wins.
  return layers.reduce<boolean | undefined>((value, layer) => layer?.[id] ?? value, undefined) === true
}

async function readMarketplaceFile(dir: string) {
  for (const candidate of [
    ...MANIFEST_DIRS.map((item) => path.join(dir, item, "marketplace.json")),
    path.join(dir, "marketplace.json"),
  ]) {
    const data = await readJson<any>(candidate, undefined)
    if (data) return data
  }
  throw new Error(`No marketplace.json in ${dir}`)
}

async function readPluginManifest(dir: string) {
  for (const item of MANIFEST_DIRS) {
    const data = await readJson<any>(path.join(dir, item, "plugin.json"), undefined)
    if (data) return data
  }
  return undefined
}

async function readInstalled() {
  return (await readJson<{ plugins?: Record<string, Installed> }>(installedFile(), {})).plugins ?? {}
}

/** A path inside a folder; plugin and marketplace paths may not climb out. */
function inside(base: string, relative: string) {
  const target = path.resolve(base, relative)
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error(`${relative} points outside ${base}`)
  return target
}

function listOf(value: unknown): unknown[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/** A server from .mcp.json in DeV's MCP config shape. */
function mcpServer(server: any, fill: (text: string) => string) {
  if (!server || typeof server !== "object") return undefined
  if (typeof server.url === "string")
    return {
      type: "remote",
      url: fill(server.url),
      ...(server.headers ? { headers: server.headers } : {}),
    }
  if (typeof server.command !== "string") return undefined
  return {
    type: "local",
    command: [
      fill(server.command),
      ...(Array.isArray(server.args) ? server.args.map((arg: unknown) => fill(String(arg))) : []),
    ],
    ...(server.env
      ? { environment: Object.fromEntries(Object.entries(server.env).map(([k, v]) => [k, fill(String(v))])) }
      : {}),
  }
}

export async function configFile(scope: Scope, project: string) {
  const dir = scope === "user" ? Global.Path.config : path.join(project, Brand.CONFIG_DIR)
  const names = Brand.CONFIG_NAMES.flatMap((name) =>
    scope === "local" ? [`${name}.local.jsonc`, `${name}.local.json`] : [`${name}.jsonc`, `${name}.json`],
  )
  for (const name of names) {
    const file = path.join(dir, name)
    if (await Bun.file(file).exists()) return file
  }
  return path.join(dir, scope === "local" ? `${Brand.CONFIG_NAME}.local.json` : `${Brand.CONFIG_NAME}.json`)
}

async function readConfig(
  scope: Scope,
  project: string,
): Promise<{ enabled_plugins?: Record<string, boolean>; plugin?: ConfigPluginV1.Spec[] }> {
  const text = await fs.readFile(await configFile(scope, project), "utf8").catch(() => "{}")
  return parse(text) ?? {}
}

async function editConfig(scope: Scope, project: string, at: string[], value: unknown) {
  const file = await configFile(scope, project)
  const text = await fs.readFile(file, "utf8").catch(() => "{}\n")
  const next = applyEdits(text, modify(text, at, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }))
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, next)
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  const text = await fs.readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return fallback
  return (parse(text) as T) ?? fallback
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n")
}

export * as Marketplace from "."
