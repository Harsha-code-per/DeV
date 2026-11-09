import { EOL } from "os"
import { Effect } from "effect"
import { ModelsDev } from "@dev-ai/core/models-dev"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { ProviderV2 } from "@dev-ai/core/provider"

export const ModelsCommand = effectCmd({
  command: "models [provider]",
  describe: "list all available models",
  builder: (yargs) =>
    yargs
      .positional("provider", {
        describe: "provider ID to filter models by",
        type: "string",
        array: false,
      })
      .option("verbose", {
        describe: "use more verbose model output (includes metadata like costs)",
        type: "boolean",
      })
      .option("refresh", {
        describe: "refresh the models cache from models.dev",
        type: "boolean",
      }),
  handler: Effect.fn("Cli.models")(function* (args) {
    const { Provider } = yield* Effect.promise(() => import("@/provider/provider"))
    if (args.refresh) {
      yield* ModelsDev.Service.use((s) => s.refresh(true))
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
    }

    const provider = yield* Provider.Service
    const providers = yield* provider.list()

    // One string, written with UI.end, so a long list piped to another program isn't cut off.
    const list = (providerID: ProviderV2.ID, verbose?: boolean) =>
      Object.entries(providers[providerID].models)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([modelID, model]) => `${providerID}/${modelID}${EOL}${verbose ? JSON.stringify(model, null, 2) + EOL : ""}`)
        .join("")

    if (args.provider) {
      const providerID = ProviderV2.ID.make(args.provider)
      if (!providers[providerID]) return yield* fail(`Provider not found: ${args.provider}`)
      return yield* Effect.promise(() => UI.end(list(providerID, args.verbose)))
    }

    const ids = Object.keys(providers).sort((a, b) => {
      const aIsDevcode = a.startsWith("devcode")
      const bIsDevcode = b.startsWith("devcode")
      if (aIsDevcode && !bIsDevcode) return -1
      if (!aIsDevcode && bIsDevcode) return 1
      return a.localeCompare(b)
    })

    yield* Effect.promise(() => UI.end(ids.map((id) => list(ProviderV2.ID.make(id), args.verbose)).join("")))
  }),
})
