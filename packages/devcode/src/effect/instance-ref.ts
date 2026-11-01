import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@dev-ai/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~devcode/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~devcode/WorkspaceRef", {
  defaultValue: () => undefined,
})
