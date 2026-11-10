import { describe, expect } from "bun:test"
import { LayerNode } from "@dev-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Skill } from "../../src/skill"
import { Discovery } from "../../src/skill/discovery"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Config } from "../../src/config/config"
import { CrossSpawnSpawner } from "@dev-ai/core/cross-spawn-spawner"
import { FSUtil } from "@dev-ai/core/fs-util"
import { Global } from "@dev-ai/core/global"
import { provideInstance, provideTmpdirInstance, testInstanceStoreLayer, tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import path from "path"
import fs from "fs/promises"

const node = LayerNode.compile(CrossSpawnSpawner.node)

const it = testEffect(Layer.mergeAll(LayerNode.compile(Skill.node), node, testInstanceStoreLayer))
const itWithoutClaudeFolderSkills = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Skill.node, [[RuntimeFlags.node, RuntimeFlags.layer({ disableClaudeFolderSkills: true })]]),
    node,
    testInstanceStoreLayer,
  ),
)
const itWithoutExternalSkills = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Skill.node, [[RuntimeFlags.node, RuntimeFlags.layer({ disableExternalSkills: true })]]),
    node,
    testInstanceStoreLayer,
  ),
)

async function createGlobalSkill(homeDir: string) {
  const skillDir = path.join(homeDir, ".claude", "skills", "global-test-skill")
  await fs.mkdir(skillDir, { recursive: true })
  await Bun.write(
    path.join(skillDir, "SKILL.md"),
    `---
name: global-test-skill
description: A global skill from ~/.claude/skills for testing.
---

# Global Test Skill

This skill is loaded from the global home directory.
`,
  )
}

const withHome = <A, E, R>(home: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const prev = process.env.DEV_TEST_HOME
      process.env.DEV_TEST_HOME = home
      return prev
    }),
    () => self,
    (prev) =>
      Effect.sync(() => {
        process.env.DEV_TEST_HOME = prev
      }),
  )

describe("skill", () => {
  it.effect("the verbose list names skills without their file paths", () =>
    Effect.sync(() => {
      const output = Skill.fmt(
        [
          {
            name: "tagged-skill",
            description: "A tagged skill.",
            location: "/tmp/plugin.git#v1.3.0/SKILL.md",
            content: "",
          },
          {
            name: "built-in-skill",
            description: "A built-in skill.",
            location: "<built-in>",
            content: "",
          },
        ],
        { verbose: true },
      )

      expect(output).toContain("<name>tagged-skill</name>")
      expect(output).toContain("<description>A built-in skill.</description>")
      expect(output).not.toContain("SKILL.md")
      expect(output).not.toContain("<location>")
    }),
  )

  it.live("allowed-tools in either written form becomes permission rules", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".dev", "skill", "commit", "SKILL.md"),
                "---\nname: commit\ndescription: Commit.\nallowed-tools: Bash(git add:*), Bash(git status), Read, mcp__github__create_issue, Unknown\n---\nCommit.\n",
              ),
              Bun.write(
                path.join(dir, ".dev", "skill", "look", "SKILL.md"),
                "---\nname: look\ndescription: Look.\nallowed-tools:\n  - Grep\n  - mcp__docs\n---\nLook.\n",
              ),
            ]),
          )
          const skill = yield* Skill.Service
          const rules = (name: string) =>
            Effect.map(skill.require(name), (info) => Skill.grants(info).map((rule) => `${rule.permission} ${rule.pattern}`))
          expect(yield* rules("commit")).toEqual([
            "bash git add *",
            "bash git add",
            "bash git status",
            "read *",
            "github_create_issue *",
          ])
          expect(yield* rules("look")).toEqual(["grep *", "docs_* *"])
        }),
      { git: true },
    ),
  )

  it.live("discovers skills from .dev/skill/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".dev", "skill", "test-skill", "SKILL.md"),
              `---
name: test-skill
description: A test skill for verification.
---

# Test Skill

Instructions here.
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "test-skill")
          expect(item).toBeDefined()
          expect(item!.description).toBe("A test skill for verification.")
          expect(item!.location).toContain(path.join("skill", "test-skill", "SKILL.md"))
        }),
      { git: true },
    ),
  )

  it.live("returns skill directories from Skill.dirs", () =>
    provideTmpdirInstance(
      (dir) =>
        withHome(
          dir,
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              Bun.write(
                path.join(dir, ".dev", "skill", "dir-skill", "SKILL.md"),
                `---
name: dir-skill
description: Skill for dirs test.
---

# Dir Skill
`,
              ),
            )

            const skill = yield* Skill.Service
            const dirs = yield* skill.dirs()
            expect(dirs).toContain(path.join(dir, ".dev", "skill", "dir-skill"))
            expect(dirs.length).toBe(1)
          }),
        ),
      { git: true },
    ),
  )

  it.live("discovers multiple skills from .dev/skill/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".dev", "skill", "skill-one", "SKILL.md"),
                `---
name: skill-one
description: First test skill.
---

# Skill One
`,
              ),
              Bun.write(
                path.join(dir, ".dev", "skill", "skill-two", "SKILL.md"),
                `---
name: skill-two
description: Second test skill.
---

# Skill Two
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.length).toBe(2)
          expect(list.find((x) => x.name === "skill-one")).toBeDefined()
          expect(list.find((x) => x.name === "skill-two")).toBeDefined()
        }),
      { git: true },
    ),
  )

  it.live("skips skills with missing frontmatter", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".dev", "skill", "no-frontmatter", "SKILL.md"),
              `# No Frontmatter

Just some content without YAML frontmatter.
`,
            ),
          )

          const skill = yield* Skill.Service
          expect((yield* skill.all()).filter((s) => s.location !== "<built-in>")).toEqual([])
        }),
      { git: true },
    ),
  )

  it.live("discovers skills without descriptions", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".dev", "skill", "manual-skill", "SKILL.md"),
              `---
name: manual-skill
---

# Manual Skill

Instructions here.
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "manual-skill")
          expect(item).toBeDefined()
          expect(item!.description).toBeUndefined()
          expect(Skill.fmt(list, { verbose: false })).toBe("No skills are currently available.")
          expect(Skill.fmt(list, { verbose: true })).toBe("No skills are currently available.")
        }),
      { git: true },
    ),
  )

  it.live("discovers skills from .claude/skills/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
              `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "claude-skill")
          expect(item).toBeDefined()
          expect(item!.location).toContain(path.join(".claude", "skills", "claude-skill", "SKILL.md"))
        }),
      { git: true },
    ),
  )

  it.live("discovers global skills from ~/.claude/skills/ directory", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir({ git: true })),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )

      yield* withHome(
        tmp.path,
        Effect.gen(function* () {
          yield* Effect.promise(() => createGlobalSkill(tmp.path))
          yield* Effect.gen(function* () {
            const skill = yield* Skill.Service
            const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
            expect(list.length).toBe(1)
            expect(list[0].name).toBe("global-test-skill")
            expect(list[0].description).toBe("A global skill from ~/.claude/skills for testing.")
            expect(list[0].location).toContain(path.join(".claude", "skills", "global-test-skill", "SKILL.md"))
          }).pipe(provideInstance(tmp.path))
        }),
      )
    }),
  )

  it.live("returns empty array when no skills exist", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          expect((yield* skill.all()).filter((s) => s.location !== "<built-in>")).toEqual([])
        }),
      { git: true },
    ),
  )

  it.live("fails with typed error when requiring a missing skill", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          const error = yield* Effect.flip(skill.require("missing-skill"))
          expect(error).toBeInstanceOf(Skill.NotFoundError)
          expect(error._tag).toBe("Skill.NotFoundError")
          expect(error.name).toBe("missing-skill")
          expect(error.message).toContain('Skill "missing-skill" not found.')
        }),
      { git: true },
    ),
  )

  it.effect("exposes tagged expected skill failure classes", () =>
    Effect.sync(() => {
      const invalid = new Skill.InvalidError({ path: "/tmp/SKILL.md", message: "Invalid skill frontmatter" })
      const mismatch = new Skill.NameMismatchError({
        path: "/tmp/SKILL.md",
        expected: "expected-skill",
        actual: "actual-skill",
      })

      expect(invalid).toBeInstanceOf(Skill.InvalidError)
      expect(invalid._tag).toBe("SkillInvalidError")
      expect(mismatch).toBeInstanceOf(Skill.NameMismatchError)
      expect(mismatch._tag).toBe("SkillNameMismatchError")
    }),
  )

  it.live("discovers skills from .agents/skills/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
              `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "agent-skill")
          expect(item).toBeDefined()
          expect(item!.location).toContain(path.join(".agents", "skills", "agent-skill", "SKILL.md"))
        }),
      { git: true },
    ),
  )

  it.live("discovers global skills from ~/.agents/skills/ directory", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir({ git: true })),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )

      yield* withHome(
        tmp.path,
        Effect.gen(function* () {
          const skillDir = path.join(tmp.path, ".agents", "skills", "global-agent-skill")
          yield* Effect.promise(() => fs.mkdir(skillDir, { recursive: true }))
          yield* Effect.promise(() =>
            Bun.write(
              path.join(skillDir, "SKILL.md"),
              `---
name: global-agent-skill
description: A global skill from ~/.agents/skills for testing.
---

# Global Agent Skill

This skill is loaded from the global home directory.
`,
            ),
          )

          yield* Effect.gen(function* () {
            const skill = yield* Skill.Service
            const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
            expect(list.length).toBe(1)
            expect(list[0].name).toBe("global-agent-skill")
            expect(list[0].description).toBe("A global skill from ~/.agents/skills for testing.")
            expect(list[0].location).toContain(path.join(".agents", "skills", "global-agent-skill", "SKILL.md"))
          }).pipe(provideInstance(tmp.path))
        }),
      )
    }),
  )

  it.live("discovers skills from both .claude/skills/ and .agents/skills/", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.length).toBe(2)
          expect(list.find((x) => x.name === "claude-skill")).toBeDefined()
          expect(list.find((x) => x.name === "agent-skill")).toBeDefined()
        }),
      { git: true },
    ),
  )

  itWithoutClaudeFolderSkills.live("skips .claude folder skills when disabled", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.map((s) => s.name)).toEqual(["agent-skill"])
        }),
      { git: true },
    ),
  )

  itWithoutExternalSkills.live("skips external skill directories when disabled", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
              Bun.write(
                path.join(dir, ".dev", "skill", "devcode-skill", "SKILL.md"),
                `---
name: devcode-skill
description: A skill in the .dev/skill directory.
---

# DeV Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.map((s) => s.name)).toEqual(["devcode-skill"])
        }),
      { git: true },
    ),
  )

  it.live("properly resolves directories that skills live in", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
              Bun.write(
                path.join(dir, ".dev", "skill", "agent-skill", "SKILL.md"),
                `---
name: devcode-skill
description: A skill in the .dev/skill directory.
---

# DeV Skill
`,
              ),
              Bun.write(
                path.join(dir, ".dev", "skills", "agent-skill", "SKILL.md"),
                `---
name: devcode-skill
description: A skill in the .dev/skills directory.
---

# DeV Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          expect((yield* skill.dirs()).length).toBe(4)
        }),
      { git: true },
    ),
  )
})

// An existing .claude folder (CLAUDE_CONFIG_DIR), its enabled plugins, and the common SKILL.md options.
describe("skill from an existing .claude folder", () => {
  const write = (file: string, text: string) =>
    fs.mkdir(path.dirname(file), { recursive: true }).then(() => Bun.write(file, text))

  async function claudeHome(home: string) {
    const config = path.join(home, ".claude-personal")
    const plugin = path.join(config, "plugins", "cache", "market", "tools", "1.0.0")
    const off = path.join(config, "plugins", "cache", "market", "off", "1.0.0")
    await write(
      path.join(config, "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "tools@market": [{ scope: "user", installPath: plugin }],
          "off@market": [{ scope: "user", installPath: off }],
        },
      }),
    )
    await write(
      path.join(config, "settings.json"),
      JSON.stringify({ enabledPlugins: { "tools@market": true, "off@market": false } }),
    )
    await write(
      path.join(plugin, "skills", "deploy", "SKILL.md"),
      `---\nname: deploy\ndescription: Deploy the app.\nargument-hint: "[env]"\ndisable-model-invocation: true\n---\nRun \${CLAUDE_PLUGIN_ROOT}/scripts/deploy.sh $0\n`,
    )
    await write(
      path.join(plugin, "skills", "helper", "SKILL.md"),
      `---\nname: helper\ndescription: Background knowledge.\nuser-invocable: false\ncontext: fork\nagent: Explore\n---\nLook around.\n`,
    )
    await write(
      path.join(off, "skills", "hidden", "SKILL.md"),
      `---\nname: hidden\ndescription: Disabled plugin.\n---\nx\n`,
    )
    await write(
      path.join(config, "skills", "personal", "SKILL.md"),
      `---\nname: personal\ndescription: From CLAUDE_CONFIG_DIR.\n---\nUse \${CLAUDE_SKILL_DIR}/notes.md\n`,
    )
    return config
  }

  it.live("loads skills from CLAUDE_CONFIG_DIR and from its enabled plugins, named plugin:skill", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir({ git: true })),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const config = yield* Effect.promise(() => claudeHome(tmp.path))
      const before = process.env.CLAUDE_CONFIG_DIR
      process.env.CLAUDE_CONFIG_DIR = config
      yield* withHome(
        tmp.path,
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          const names = (yield* skill.all()).map((item) => item.name).toSorted()
          expect(names).toContain("tools:deploy")
          expect(names).toContain("tools:helper")
          expect(names).toContain("personal")
          expect(names.some((name) => name.includes("hidden"))).toBe(false)

          const deploy = (yield* skill.get("tools:deploy"))!
          expect(deploy.argumentHint).toBe("[env]")
          expect(Skill.render(deploy, { project: "/p", arguments: "prod" })).toContain(
            `${deploy.plugin!.root}/scripts/deploy.sh prod`,
          )
          // disable-model-invocation keeps it out of what DeV may load by itself.
          expect((yield* skill.available()).map((item) => item.name)).not.toContain("tools:deploy")

          const helper = (yield* skill.get("tools:helper"))!
          expect(helper.userInvocable).toBe(false)
          expect(helper.fork).toBe("Explore")

          const personal = (yield* skill.get("personal"))!
          expect(Skill.render(personal, { project: "/p" })).toContain(
            path.join(config, "skills", "personal", "notes.md"),
          )
        }).pipe(provideInstance(tmp.path)),
      ).pipe(Effect.ensuring(Effect.sync(() => (process.env.CLAUDE_CONFIG_DIR = before))))
    }),
  )
})

describe("Skill.render", () => {
  const skill = (content: string, extra: Partial<Skill.Info> = {}): Skill.Info => ({
    name: "s",
    location: "/skills/s/SKILL.md",
    content,
    ...extra,
  })

  it.effect("fills arguments in the common SKILL.md way", () =>
    Effect.sync(() => {
      expect(Skill.render(skill("Migrate $0 from $1 to $2."), { project: "/p", arguments: "Search JS TS" })).toBe(
        "Migrate Search from JS to TS.",
      )
      expect(Skill.render(skill("A: $ARGUMENTS[1] / all: $ARGUMENTS"), { project: "/p", arguments: '"a b" c' })).toBe(
        'A: c / all: "a b" c',
      )
      expect(
        Skill.render(skill("Fix $issue on $branch", { arguments: ["issue", "branch"] }), {
          project: "/p",
          arguments: "42",
        }),
      ).toBe("Fix 42 on ")
      // A $N no argument fills stays, so shell snippets survive; \$ is a literal dollar.
      expect(Skill.render(skill("awk '{print $2}' costs \\$5 for $0"), { project: "/p", arguments: "x" })).toBe(
        "awk '{print $2}' costs $5 for x",
      )
      // Arguments with no placeholder to go into are appended.
      expect(Skill.render(skill("Review."), { project: "/p", arguments: "src/app.ts" })).toBe(
        "Review.\n\nARGUMENTS: src/app.ts",
      )
      expect(
        Skill.render(skill("In ${CLAUDE_SKILL_DIR} for $CLAUDE_PROJECT_DIR (${CLAUDE_SESSION_ID})"), {
          project: "/p",
          sessionID: "ses_1",
        }),
      ).toBe("In /skills/s for /p (ses_1)")
    }),
  )
})
