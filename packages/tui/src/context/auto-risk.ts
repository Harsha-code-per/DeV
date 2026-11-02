import type { PermissionRequest } from "@dev-ai/sdk/v2"

// Auto mode approves requests without asking, except the ones below, which still come to the person:
// actions that are destructive, irreversible, reach outside the project's sandbox, or touch secrets.
// ponytail: fixed patterns rather than a classifier model, so the check is instant, free and the same
// every time; a model can sit behind it later for commands these rules cannot judge.
const RISKY_COMMANDS: [RegExp, string][] = [
  [/\brm\s+(-[a-z]*[rf][a-z]*\s+)+(\/|~|\$HOME|\.\.|\*|\/\*)(\s|$)/i, "deletes a whole folder tree"],
  [/\bgit\s+push\b.*(--force|-f\b|--force-with-lease)/i, "rewrites shared git history"],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.|branch\s+-D|stash\s+(drop|clear))/i, "throws away work"],
  [/\bsudo\b|\bdoas\b|\bsu\s+-?\s*(root)?\s*-c\b/i, "runs as an administrator"],
  [/\b(curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/i, "runs a script straight from the internet"],
  [/\b(mkfs|fdisk|parted|diskpart|format\s+[a-z]:)|\bdd\b.*\bof=\/dev\//i, "writes to a disk directly"],
  [/\b(shutdown|reboot|halt|poweroff)\b/i, "shuts the computer down"],
  [/:\(\)\s*\{.*\};\s*:/, "is a fork bomb"],
  [/\bchmod\s+(-R\s+)?[0-7]*777\b|\bchown\s+-R\b/i, "changes permissions widely"],
  [/\b(npm|pnpm|yarn|bun)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b/i, "publishes a package"],
  [/\b(terraform\s+destroy|kubectl\s+delete|helm\s+uninstall|docker\s+system\s+prune|aws\s+s3\s+rm\b.*--recursive)/i, "deletes infrastructure"],
  [/\b(drop\s+(database|table|schema)|truncate\s+table)\b/i, "deletes database data"],
  [/(~|\$HOME|\/home\/[^/\s]+|\/Users\/[^/\s]+)\/\.(ssh|aws|gnupg|kube|docker)\b/i, "touches credentials"],
]
const SECRET_FILE = /(^|\/)(\.env(\.[\w-]+)?|id_[a-z0-9]+|[\w-]*credentials?[\w.-]*|\.npmrc|\.netrc|\.pypirc)$/i

/** Why auto mode should still ask about this request, or undefined when it can go ahead. */
export function riskOf(request: Pick<PermissionRequest, "permission" | "patterns" | "metadata">) {
  const command = typeof request.metadata?.command === "string" ? request.metadata.command : undefined
  if (request.metadata?.sandbox === "escape") return "runs outside the sandbox"
  if (request.permission === "bash" && command) {
    const found = RISKY_COMMANDS.find(([pattern]) => pattern.test(command))
    if (found) return found[1]
  }
  const files = [request.metadata?.filepath, request.metadata?.filePath, ...request.patterns].filter(
    (item): item is string => typeof item === "string",
  )
  if (["edit", "write", "apply_patch", "read"].includes(request.permission) && files.some((file) => SECRET_FILE.test(file)))
    return "touches a secrets file"
  return undefined
}
