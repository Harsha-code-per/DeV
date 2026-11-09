import { SessionID } from "@/session/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"

export const SessionSuggestApi = HttpApi.make("sessionSuggest").add(
  HttpApiGroup.make("sessionSuggest")
    .add(
      HttpApiEndpoint.post("suggest", "/session/:sessionID/suggest", {
        params: { sessionID: SessionID },
        query: WorkspaceRoutingQuery,
        success: Schema.Struct({ text: Schema.optional(Schema.String) }),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "session.suggest",
          summary: "Suggest the next prompt",
          description: "Guess what the user will ask next, from the last exchange, using the small model.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "sessionSuggest", description: "Prompt suggestion routes." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
