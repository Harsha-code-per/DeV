export * as ConfigSandboxV1 from "./sandbox"

import { Schema } from "effect"

const Paths = Schema.optional(Schema.mutable(Schema.Array(Schema.String)))

export const Info = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run shell commands in the OS sandbox on Linux and macOS (default false). Confined commands write only to the project and temp folders, cannot read credentials and reach only package registries and git hosts",
  }),
  network: Schema.optional(
    Schema.Struct({
      allow: Paths.annotate({
        description: "Extra hosts sandboxed commands may reach, e.g. a private registry (wildcards like *.example.com)",
      }),
    }),
  ),
  filesystem: Schema.optional(
    Schema.Struct({
      allowWrite: Paths.annotate({ description: "Extra paths sandboxed commands may write (~ is your home)" }),
      allowRead: Paths.annotate({
        description:
          "Credential paths DeV hides by default that sandboxed commands may read, e.g. ~/.npmrc for a private registry",
      }),
    }),
  ),
}).annotate({ description: "OS sandbox for shell commands" })
export type Info = Schema.Schema.Type<typeof Info>
