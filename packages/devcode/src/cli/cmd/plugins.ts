import path from "path"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { Marketplace } from "@/marketplace"
import { Process } from "@/util/process"

const ACTIONS = ["list", "search", "install", "uninstall", "enable", "disable", "update", "marketplace"] as const

export const PluginsCommand = cmd({
  command: "plugins <action> [target..]",
  describe: "install plugins (skills, commands, agents, hooks, MCP servers) from plugin marketplaces",
  builder: (yargs) =>
    yargs
      .positional("action", {
        describe:
          "list | search [words] | install <plugin[@marketplace]> | uninstall | enable | disable | update [plugin] | marketplace add|list|update|remove",
        choices: ACTIONS,
      })
      .positional("target", {
        describe: "plugin id, search words, or marketplace arguments",
        type: "string",
        array: true,
      })
      .option("scope", {
        describe:
          "user: you, everywhere (default). project: everyone on this repo (.dev/dev.json). local: you, this repo only",
        choices: ["user", "project", "local"] as const,
        default: "user" as const,
      }),
  handler: async (args) => {
    const project = await projectRoot()
    const [first, ...rest] = args.target ?? []
    const scope = args.scope

    if (args.action === "marketplace") return marketplace(first, rest)

    if (args.action === "list") {
      const list = await Marketplace.installed(project)
      if (list.length === 0) UI.println("No plugins installed. Find some with `devcode plugins search`.")
      for (const item of list)
        UI.println(
          `${item.enabled ? "●" : "○"} ${UI.Style.TEXT_NORMAL_BOLD}${item.id}${UI.Style.TEXT_NORMAL} ${UI.Style.TEXT_DIM}${item.version}${item.scope ? ` · ${item.scope}` : ""}${UI.Style.TEXT_NORMAL}`,
        )
      return
    }

    if (args.action === "search") {
      const words = (args.target ?? []).join(" ").toLowerCase().split(/\s+/).filter(Boolean)
      const all = await Marketplace.entries()
      if (all.length === 0) {
        UI.println("No marketplaces added yet. Add one with `devcode plugins marketplace add <owner/repo>`.")
        return
      }
      const found = all.filter((entry) => {
        const text = [entry.name, entry.description, entry.category, ...(entry.tags ?? []), ...(entry.keywords ?? [])]
          .join(" ")
          .toLowerCase()
        return words.every((word) => text.includes(word))
      })
      for (const entry of found) {
        UI.println(`${UI.Style.TEXT_NORMAL_BOLD}${entry.name}@${entry.marketplace}${UI.Style.TEXT_NORMAL}`)
        if (entry.description) UI.println(`  ${entry.description}`)
      }
      if (found.length === 0) UI.println(`No plugins match "${words.join(" ")}".`)
      return
    }

    if (args.action === "update") {
      const ids = first ? [first] : (await Marketplace.installed(project)).map((item) => item.id)
      for (const id of ids) {
        const result = await Marketplace.update(id, project)
        UI.println(
          result.from === result.to
            ? `${result.id} is up to date (${result.to})`
            : `${result.id}: ${result.from} → ${result.to}`,
        )
      }
      return
    }

    if (!first)
      throw new Error(`Say which plugin to ${args.action}, e.g. \`devcode plugins ${args.action} name@marketplace\``)

    if (args.action === "install") {
      const result = await Marketplace.install(first, scope, project)
      UI.println(`Installed ${result.id} (${result.version}) for ${scopeText(scope)}.`)
      UI.println(`  ${describe(result.contents)}`)
      UI.println("  It loads in the next session.")
      return
    }
    if (args.action === "uninstall") {
      UI.println(`Removed ${await Marketplace.uninstall(first, scope, project)} from ${scope} scope.`)
      return
    }
    const id = await Marketplace.setEnabled(first, scope, project, args.action === "enable")
    UI.println(`${args.action === "enable" ? "Enabled" : "Disabled"} ${id} in ${scope} scope.`)
  },
})

async function marketplace(action: string | undefined, rest: string[]) {
  if (action === "add") {
    if (!rest[0]) throw new Error("Give a marketplace: owner/repo, a git URL, a URL to marketplace.json, or a folder")
    const market = await Marketplace.addMarketplace(rest[0])
    UI.println(`Added marketplace ${market.name} with ${market.plugins.length} plugins.`)
    return
  }
  if (action === "update") {
    const names = rest[0] ? [rest[0]] : (await Marketplace.marketplaces()).map((item) => item.name)
    for (const name of names)
      UI.println(`Updated ${name}: ${(await Marketplace.updateMarketplace(name)).plugins.length} plugins.`)
    return
  }
  if (action === "remove") {
    if (!rest[0]) throw new Error("Say which marketplace to remove")
    await Marketplace.removeMarketplace(rest[0])
    UI.println(`Removed marketplace ${rest[0]} and its plugins.`)
    return
  }
  const list = await Marketplace.marketplaces()
  if (list.length === 0)
    UI.println("No marketplaces added yet. Add one with `devcode plugins marketplace add <owner/repo>`.")
  for (const item of list)
    UI.println(
      `${UI.Style.TEXT_NORMAL_BOLD}${item.name}${UI.Style.TEXT_NORMAL} ${UI.Style.TEXT_DIM}${item.plugins.length} plugins · ${item.source}${UI.Style.TEXT_NORMAL}`,
    )
}

function describe(contents: Awaited<ReturnType<typeof Marketplace.contents>>) {
  const parts = [
    contents.skills && count(contents.skills, "skill"),
    contents.commands && count(contents.commands, "command"),
    contents.agents && count(contents.agents, "agent"),
    contents.hooks && `${count(contents.hooks, "hook")} (these run commands on your machine)`,
    contents.mcp.length > 0 && `MCP servers: ${contents.mcp.join(", ")}`,
  ].filter(Boolean)
  return parts.length > 0
    ? `Contains ${parts.join(", ")}.`
    : "Contains no skills, commands, agents, hooks or MCP servers."
}

function scopeText(scope: Marketplace.Scope) {
  if (scope === "project") return "everyone on this repo (.dev/dev.json)"
  if (scope === "local") return "you, in this repo only (.dev/dev.local.json)"
  return "you, in every project"
}

async function projectRoot() {
  const out = await Process.text(["git", "rev-parse", "--show-toplevel"], { nothrow: true })
  return out.code === 0 && out.text.trim() ? path.resolve(out.text.trim()) : process.cwd()
}

function count(n: number | string, word: string) {
  return `${n} ${word}${Number(n) === 1 ? "" : "s"}`
}
