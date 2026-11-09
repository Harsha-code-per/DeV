import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const Scope = Schema.Literals(["user", "project", "local"])

export const PluginEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  marketplace: Schema.String,
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String),
  homepage: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.String),
  stars: Schema.optional(Schema.Number),
  verified: Schema.optional(Schema.Boolean),
  needs: Schema.optional(Schema.Array(Schema.String)),
}).annotate({ identifier: "PluginEntry" })

export const PluginInstalled = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  enabled: Schema.Boolean,
  scope: Schema.optional(Scope),
  installPath: Schema.String,
  installedAt: Schema.String,
  /** "code" for an npm or git code plugin (DeV's built-ins too), which can only be switched on or off here. */
  kind: Schema.optional(Schema.String),
}).annotate({ identifier: "PluginInstalled" })

export const PluginMarketplace = Schema.Struct({
  name: Schema.String,
  source: Schema.String,
  description: Schema.optional(Schema.String),
  owner: Schema.optional(Schema.String),
  plugins: Schema.Number,
}).annotate({ identifier: "PluginMarketplace" })

export const PluginContents = Schema.Struct({
  skills: Schema.Number,
  commands: Schema.Number,
  agents: Schema.Number,
  hooks: Schema.Number,
  mcp: Schema.Array(Schema.String),
}).annotate({ identifier: "PluginContents" })

export const PluginResult = Schema.Struct({
  id: Schema.String,
  message: Schema.String,
  contents: Schema.optional(PluginContents),
}).annotate({ identifier: "PluginResult" })

export class PluginError extends Schema.ErrorClass<PluginError>("PluginError")(
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export const PluginsPaths = {
  available: "/plugins/available",
  installed: "/plugins/installed",
  marketplaces: "/plugins/marketplaces",
  marketplace: "/plugins/marketplaces/:name",
  marketplaceUpdate: "/plugins/marketplaces/:name/update",
  install: "/plugins/install",
  uninstall: "/plugins/uninstall",
  enable: "/plugins/enable",
  update: "/plugins/update",
} as const

const annotate = (identifier: string, summary: string) =>
  OpenApi.annotations({ identifier, summary, description: summary })

export const PluginsApi = HttpApi.make("plugins")
  .add(
    HttpApiGroup.make("plugins")
      .add(
        HttpApiEndpoint.get("available", PluginsPaths.available, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(PluginEntry), "Plugins in every added marketplace"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.available", "List plugins in the added marketplaces")),
        HttpApiEndpoint.get("installed", PluginsPaths.installed, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(PluginInstalled), "Installed plugins"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.installed", "List installed plugins and where they are on")),
        HttpApiEndpoint.get("marketplaces", PluginsPaths.marketplaces, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(PluginMarketplace), "Added marketplaces"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.marketplaces", "List plugin marketplaces")),
        HttpApiEndpoint.post("marketplaceAdd", PluginsPaths.marketplaces, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({ source: Schema.String }),
          success: described(PluginMarketplace, "The added marketplace"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.marketplace.add", "Add a plugin marketplace")),
        HttpApiEndpoint.post("marketplaceUpdate", PluginsPaths.marketplaceUpdate, {
          params: { name: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(PluginMarketplace, "The updated marketplace"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.marketplace.update", "Fetch a marketplace's latest plugin list")),
        HttpApiEndpoint.delete("marketplaceRemove", PluginsPaths.marketplace, {
          params: { name: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Removed"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.marketplace.remove", "Remove a marketplace and its plugins")),
        HttpApiEndpoint.post("install", PluginsPaths.install, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({ id: Schema.String, scope: Scope }),
          success: described(PluginResult, "Installed"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.install", "Install a plugin and turn it on in a scope")),
        HttpApiEndpoint.post("uninstall", PluginsPaths.uninstall, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({ id: Schema.String, scope: Scope }),
          success: described(PluginResult, "Uninstalled"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.uninstall", "Remove a plugin from a scope")),
        HttpApiEndpoint.post("enable", PluginsPaths.enable, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({ id: Schema.String, scope: Scope, enabled: Schema.Boolean }),
          success: described(PluginResult, "Changed"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.enable", "Turn a plugin on or off in a scope")),
        HttpApiEndpoint.post("update", PluginsPaths.update, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({ id: Schema.String }),
          success: described(PluginResult, "Updated"),
          error: PluginError,
        }).annotateMerge(annotate("plugins.update", "Update a plugin to its marketplace's current version")),
      )
      .annotateMerge(OpenApi.annotations({ title: "plugins", description: "Plugin marketplaces and installs." }))
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(OpenApi.annotations({ title: "dev plugins HttpApi", version: "0.0.1", description: "Plugins." }))
