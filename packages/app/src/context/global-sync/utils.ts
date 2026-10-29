import type { Project, ProviderListResponse } from "@dev-ai/sdk/v2/client"
import { NormalizedProviderListResponse } from "@dev-ai/session-ui/context"
export { pathKey as directoryKey, type PathKey as DirectoryKey } from "@/utils/path-key"

export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function normalizeProviderList(providers: ProviderListResponse): NormalizedProviderListResponse {
  return {
    ...providers,
    all: new Map(
      providers.all.map((provider) => [
        provider.id,
        {
          ...provider,
          models: Object.fromEntries(
            Object.entries(provider.models).filter(([, model]) => model.status !== "deprecated"),
          ),
        },
      ]),
    ),
  }
}

export function sanitizeProject(project: Project) {
  if (!project.icon?.url && !project.icon?.override) return project
  return {
    ...project,
    icon: {
      ...project.icon,
      url: undefined,
      override: undefined,
    },
  }
}

export function normalizeProjectInfo(project: Project): Project {
  return {
    ...project,
    vcs: project.vcs === "git" ? "git" : undefined,
  }
}
