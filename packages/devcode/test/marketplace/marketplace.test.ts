import { afterAll, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Marketplace } from "../../src/marketplace"
import { ConfigPlugin } from "../../src/config/plugin"

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-marketplace-"))
afterAll(() => fs.rm(dir, { recursive: true, force: true }))

const write = (file: string, text: string) =>
  fs.mkdir(path.dirname(file), { recursive: true }).then(() => Bun.write(file, text))
const git = (cwd: string, ...args: string[]) =>
  Bun.spawn(["git", "-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, stdout: "ignore", stderr: "ignore" })
    .exited

// A marketplace in the common format: one plugin in the marketplace's own repo, one in a separate git repo.
async function fixture() {
  const market = path.join(dir, "market")
  const plugin = path.join(market, "plugins", "tools")
  await write(
    path.join(market, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: "acme",
      owner: { name: "Acme" },
      plugins: [
        { name: "tools", source: "./plugins/tools", description: "Team tools", tags: ["review"] },
        {
          name: "remote",
          source: { source: "url", url: `file://${path.join(dir, "remote")}` },
          description: "From git",
        },
        { name: "escape", source: "../../etc", description: "Points outside" },
      ],
    }),
  )
  await write(path.join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "tools", version: "1.2.0" }))
  await write(
    path.join(plugin, "skills", "lint", "SKILL.md"),
    "---\nname: lint\ndescription: Lint it.\n---\nRun ${CLAUDE_PLUGIN_ROOT}/lint.sh\n",
  )
  await write(
    path.join(plugin, "commands", "hello.md"),
    "---\ndescription: Say hello\n---\nHello from ${CLAUDE_PLUGIN_ROOT}\n",
  )
  await write(path.join(plugin, "agents", "reviewer.md"), "---\ndescription: Reviews code\nmodel: opus\n---\nYou review code.\n")
  await write(
    path.join(plugin, "hooks", "hooks.json"),
    JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: "edit",
            hooks: [
              { type: "command", command: "${CLAUDE_PLUGIN_ROOT}/fmt.sh" },
              { type: "prompt", prompt: "x" },
            ],
          },
        ],
      },
    }),
  )
  await write(
    path.join(plugin, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        db: { command: "${CLAUDE_PLUGIN_ROOT}/db", args: ["--port", "1"], env: { A: "b" } },
        web: { type: "http", url: "https://x.example/mcp" },
      },
    }),
  )
  await git(market, "init", "-q")
  await git(market, "add", ".")
  await git(market, "commit", "-qm", "init")

  const remote = path.join(dir, "remote")
  await write(path.join(remote, "skills", "ship", "SKILL.md"), "---\nname: ship\ndescription: Ship it.\n---\nShip.\n")
  await git(remote, "init", "-q")
  await git(remote, "add", ".")
  await git(remote, "commit", "-qm", "init")
  return market
}

describe("plugin marketplaces", () => {
  test("add a marketplace, install a plugin per scope, and load what it brings", async () => {
    const market = await fixture()
    const project = path.join(dir, "project")
    await fs.mkdir(project, { recursive: true })

    const added = await Marketplace.addMarketplace(market)
    expect(added.name).toBe("acme")
    expect(added.plugins.map((item) => item.name)).toEqual(["tools", "remote", "escape"])

    const result = await Marketplace.install("tools", "project", project)
    expect(result.id).toBe("tools@acme")
    expect(result.version).toBe("1.2.0")
    expect(result.contents).toMatchObject({ skills: 1, commands: 1, agents: 1, hooks: 1, mcp: ["db", "web"] })
    const projectConfig = await Bun.file(path.join(project, ".dev", "dev.json")).json()
    expect(projectConfig.enabled_plugins).toEqual({ "tools@acme": true })

    const [plugin] = await Marketplace.enabled(projectConfig)
    const parts = await Marketplace.components(plugin!)
    expect(parts.commands["tools:hello"].template).toBe(`Hello from ${plugin!.root}`)
    expect(parts.agents["tools:reviewer"].prompt).toBe("You review code.")
    // A model alias without a provider means the session's own model.
    expect(parts.agents["tools:reviewer"].model).toBeUndefined()
    // Only hook kinds DeV runs are kept.
    expect(parts.hooks.PostToolUse).toEqual([
      { matcher: "edit", hooks: [{ type: "command", command: `${plugin!.root}/fmt.sh` }] },
    ])
    expect(parts.mcp["tools:db"]).toEqual({
      type: "local",
      command: [`${plugin!.root}/db`, "--port", "1"],
      environment: { A: "b" },
    })
    expect(parts.mcp["tools:web"]).toEqual({ type: "remote", url: "https://x.example/mcp" })

    // The local scope (dev.local.json) overrides the project for this checkout only.
    await Marketplace.setEnabled("tools@acme", "local", project, false)
    expect((await Marketplace.installed(project)).find((item) => item.id === "tools@acme")).toMatchObject({
      enabled: false,
      scope: "local",
    })

    // Removed from every scope that used it: its files go too.
    await Marketplace.uninstall("tools@acme", "local", project)
    await Marketplace.uninstall("tools@acme", "project", project)
    expect(await Bun.file(path.join(result.installPath, "commands", "hello.md")).exists()).toBe(false)
  })

  test("a plugin from its own git repo is pinned to that commit", async () => {
    const project = path.join(dir, "project2")
    await fs.mkdir(project, { recursive: true })
    const result = await Marketplace.install("remote@acme", "local", project)
    expect(result.version).toMatch(/^[0-9a-f]{12}$/)
    expect(result.contents.skills).toBe(1)
  })

  test("a plugin path can't point outside its marketplace", async () => {
    await expect(Marketplace.install("escape@acme", "user", dir)).rejects.toThrow("points outside")
  })

  test("a marketplace named in config is fetched on first use; an empty source turns it off", async () => {
    const team = path.join(dir, "team-market")
    await write(
      path.join(team, ".dev-plugin", "marketplace.json"),
      JSON.stringify({ name: "team", owner: { name: "T" }, plugins: [{ name: "one-skill", source: "./one" }] }),
    )
    await write(path.join(team, "one", "SKILL.md"), "---\nname: one-skill\ndescription: A single skill.\n---\nDo one thing.\n")
    await Marketplace.ensure({ off: { source: "" } }, dir)
    expect((await Marketplace.marketplaces()).map((item) => item.name)).not.toContain("team")
    await Marketplace.ensure({ team: { source: team } }, dir)
    expect((await Marketplace.marketplaces()).map((item) => item.name)).toContain("team")
    // A repo that is one skill (SKILL.md at its root) installs as a skill.
    // Project scope in its own folder: user scope is shared, and later skill tests would find this skill.
    const result = await Marketplace.install("one-skill@team", "project", path.join(dir, "single"))
    expect(result.contents.skills).toBe(1)
  })

  test("a code plugin, built-in ones included, is switched off by its short name", async () => {
    const project = path.join(dir, "code")
    await write(path.join(project, ".dev", "dev.json"), JSON.stringify({ plugin: ["@acme/lint-helper@1.2.0"] }))
    expect(await Marketplace.codePlugins(project)).toContainEqual(
      expect.objectContaining({ id: "lint-helper", version: "1.2.0", enabled: true, kind: "code" }),
    )
    await Marketplace.setEnabled("lint-helper", "project", project, false)
    const item = (await Marketplace.codePlugins(project)).find((entry) => entry.id === "lint-helper")
    expect(item).toMatchObject({ enabled: false, scope: "project" })
    // The loader skips a plugin switched off by its short name or its package name.
    expect(ConfigPlugin.pluginOff("@acme/lint-helper@1.2.0", { "lint-helper": false })).toBe(true)
    expect(ConfigPlugin.pluginOff("superpowers@git+https://github.com/obra/superpowers.git#v7.0.1", { superpowers: false })).toBe(true)
    expect(ConfigPlugin.pluginOff("@acme/lint-helper@1.2.0", { "lint-helper": true })).toBe(false)
  })
})
