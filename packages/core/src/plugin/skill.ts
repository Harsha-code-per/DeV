/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeDevcodeContent from "./skill/customize-devcode.md" with { type: "text" }

export const CustomizeDevcodeContent = customizeDevcodeContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-devcode",
            description:
              "Use ONLY when the user is editing or creating devcode's own configuration: dev.json, dev.jsonc, files under .dev/, or files under ~/.config/devcode/. Also use when creating or fixing devcode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring devcode itself.",
            location: AbsolutePath.make("/builtin/customize-devcode.md"),
            content: CustomizeDevcodeContent,
          }),
        }),
      )
    })
  }),
})
