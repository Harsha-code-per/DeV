import { AgentV2 } from "@dev-ai/core/agent"
import { AISDK } from "@dev-ai/core/aisdk"
import { Catalog } from "@dev-ai/core/catalog"
import { CommandV2 } from "@dev-ai/core/command"
import { Credential } from "@dev-ai/core/credential"
import { AppNodeBuilder } from "@dev-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@dev-ai/core/effect/app-node-platform"
import { LayerNode } from "@dev-ai/core/effect/layer-node"
import { EventV2 } from "@dev-ai/core/event"
import { FileSystem } from "@dev-ai/core/filesystem"
import { FSUtil } from "@dev-ai/core/fs-util"
import { Integration } from "@dev-ai/core/integration"
import { Location } from "@dev-ai/core/location"
import { Npm } from "@dev-ai/core/npm"
import { PluginV2 } from "@dev-ai/core/plugin"
import { Reference } from "@dev-ai/core/reference"
import { SkillV2 } from "@dev-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
