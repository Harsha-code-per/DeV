// Shell commands that are destructive, irreversible or reach outside the project. They always ask first,
// even inside DeV's sandbox (which still reaches git hosts and package registries), and auto mode refuses them.
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

/** Why this shell command is risky, or undefined when it isn't. */
export function commandRisk(command: string) {
  return RISKY_COMMANDS.find(([pattern]) => pattern.test(command))?.[1]
}
