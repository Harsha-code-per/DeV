import type { PermissionRequest } from "@dev-ai/sdk/v2"
import { commandRisk } from "@dev-ai/core/command-risk"

// Auto mode approves requests without asking, except the ones below, which it refuses:
// actions that are destructive, irreversible, reach outside the project's sandbox, or touch secrets.
const SECRET_FILE = /(^|\/)(\.env(\.[\w-]+)?|id_[a-z0-9]+|[\w-]*credentials?[\w.-]*|\.npmrc|\.netrc|\.pypirc)$/i

/** Why auto mode refuses this request, or undefined when it can go ahead. */
export function riskOf(request: Pick<PermissionRequest, "permission" | "patterns" | "metadata">) {
  const command = typeof request.metadata?.command === "string" ? request.metadata.command : undefined
  if (request.metadata?.sandbox === "escape") return "runs outside the sandbox"
  const risk = request.permission === "bash" && command ? commandRisk(command) : undefined
  if (risk) return risk
  const files = [request.metadata?.filepath, request.metadata?.filePath, ...request.patterns].filter(
    (item): item is string => typeof item === "string",
  )
  if (["edit", "write", "apply_patch", "read"].includes(request.permission) && files.some((file) => SECRET_FILE.test(file)))
    return "touches a secrets file"
  return undefined
}
