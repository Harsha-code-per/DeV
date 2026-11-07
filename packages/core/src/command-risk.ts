// Shell commands that are destructive, irreversible or reach outside the project. They always ask first,
// even inside DeV's sandbox (which still reaches git hosts and package registries), and auto mode refuses them.
// ponytail: fixed patterns rather than a classifier model, so the check is instant, free and the same
// every time; a model can sit behind it later for commands these rules cannot judge.
const RISKY_COMMANDS: [RegExp, string][] = [
  [/\brm\s+(-[a-z]*[rf][a-z]*\s+)+(\/|~|\$HOME|\.\.|\*|\/\*)(\s|$)/i, "deletes a whole folder tree"],
  [/\bgit\s+push\b.*(--force|-f\b|--force-with-lease)/i, "rewrites shared git history"],
  [
    /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.|branch\s+-D|stash\s+(drop|clear))/i,
    "throws away work",
  ],
  [/\bsudo\b|\bdoas\b|\bsu\s+-?\s*(root)?\s*-c\b/i, "runs as an administrator"],
  [
    /\b(curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/i,
    "runs a script straight from the internet",
  ],
  [/\b(mkfs|fdisk|parted|diskpart|format\s+[a-z]:)|\bdd\b.*\bof=\/dev\//i, "writes to a disk directly"],
  [/\b(shutdown|reboot|halt|poweroff)\b/i, "shuts the computer down"],
  [/:\(\)\s*\{.*\};\s*:/, "is a fork bomb"],
  [/\bchmod\s+(-R\s+)?[0-7]*777\b|\bchown\s+-R\b/i, "changes permissions widely"],
  [/\b(npm|pnpm|yarn|bun)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b/i, "publishes a package"],
  [
    /\b(terraform\s+destroy|kubectl\s+delete|helm\s+uninstall|docker\s+system\s+prune|aws\s+s3\s+rm\b.*--recursive)/i,
    "deletes infrastructure",
  ],
  [/\b(drop\s+(database|table|schema)|truncate\s+table)\b/i, "deletes database data"],
  [/(~|\$HOME|\/home\/[^/\s]+|\/Users\/[^/\s]+)\/\.(ssh|aws|gnupg|kube|docker)\b/i, "touches credentials"],
]

/** Why this shell command is risky, or undefined when it isn't. */
export function commandRisk(command: string) {
  return RISKY_COMMANDS.find(([pattern]) => pattern.test(command))?.[1]
}

const GIT_INTERNALS = /(^|\/)\.git\//
const SECRET_FILE = /(^|\/)(\.env(\.[\w-]+)?|id_[a-z0-9]+|[\w-]*credentials?[\w.-]*|\.npmrc|\.netrc|\.pypirc)$/i

/**
 * Why auto mode refuses this permission request, or undefined when it can go ahead: risky commands,
 * writing outside the project or into .git, and touching secrets files. A command that leaves the sandbox
 * is judged like any other, as in Claude Code: running it on the person's machine is not a risk in itself.
 */
export function requestRisk(request: {
  permission: string
  patterns: readonly string[]
  metadata?: Record<string, unknown>
}) {
  const command = typeof request.metadata?.command === "string" ? request.metadata.command : undefined
  // Set by the shell tool from statedLimit below, since only the server sees the whole conversation.
  if (typeof request.metadata?.limit === "string") return request.metadata.limit
  const risk = request.permission === "bash" && command ? commandRisk(command) : undefined
  if (risk) return risk
  // File tools aren't sandboxed, so this is what keeps auto mode inside the project: a write outside it
  // could change shell startup files, other projects or system config.
  if (request.permission === "external_directory" && request.metadata?.write) return "writes outside the project"
  const files = [request.metadata?.filepath, request.metadata?.filePath, ...request.patterns].filter(
    (item): item is string => typeof item === "string",
  )
  if (
    ["edit", "write", "apply_patch", "read"].includes(request.permission) &&
    files.some((file) => SECRET_FILE.test(file))
  )
    return "touches a secrets file"
  if (["edit", "write", "apply_patch"].includes(request.permission) && files.some((file) => GIT_INTERNALS.test(file)))
    return "changes git internals, where hooks run code"
  return undefined
}

// Actions a person can rule out in chat ("don't push", "never commit or deploy"), each with what it looks like
// as a shell command. A later message that mentions the action without negating it ("ok, push now") lifts it.
// ponytail: a fixed list of common actions; anything not listed still falls back to the risk rules above.
const ACTIONS: [string, RegExp, RegExp][] = [
  ["push", /\bpush(es|ed|ing)?\b/i, /\bgit\s+push\b/i],
  ["commit", /\bcommit(s|ted|ting)?\b/i, /\bgit\s+commit\b/i],
  ["merge", /\bmerg(e|es|ed|ing)\b/i, /\b(git\s+merge|gh\s+pr\s+merge)\b/i],
  ["rebase", /\brebas(e|es|ed|ing)\b/i, /\bgit\s+rebase\b/i],
  ["open a pull request", /\b(pr|prs|pull requests?)\b/i, /\bgh\s+pr\s+create\b/i],
  ["deploy", /\bdeploy(s|ed|ing)?\b/i, /\bdeploy\b|\b(vercel|netlify|fly|wrangler)\b.*\b(deploy|--prod)\b/i],
  [
    "publish",
    /\b(publish(es|ed|ing)?|release)\b/i,
    /\b(npm|pnpm|yarn|bun|cargo)\s+publish\b|\bgh\s+release\s+create\b/i,
  ],
  [
    "install packages",
    /\b(install(s|ed|ing)?|add (any )?(new )?(packages?|dependenc(y|ies)))\b/i,
    /\b(npm|pnpm|yarn|bun|pip3?|uv|cargo|brew|apt(-get)?|gem|go)\s+(install|add|i)\b/i,
  ],
  ["delete files", /\b(delet(e|es|ed|ing)|remov(e|es|ed|ing))\b/i, /(^|[\s;&|])(rm|rmdir|unlink|git\s+rm)\s/i],
]

const NEGATED = /\b(?:don['’]?t|do not|never|no need to|without|avoid|stop)\s+([^.,;!?\n]{0,60})/gi

/**
 * Which action the person ruled out in chat that this request would do, or undefined. `said` is what they
 * typed in this session, oldest first. Returns a reason in the same shape as requestRisk.
 */
export function statedLimit(
  said: readonly string[],
  request: { permission: string; metadata?: Record<string, unknown> },
) {
  const command = typeof request.metadata?.command === "string" ? request.metadata.command : undefined
  if (request.permission !== "bash" || !command) return undefined
  const action = ACTIONS.find(([, word, shell]) => {
    if (!shell.test(command)) return false
    const last = said.findLast((text) => word.test(text))
    return last !== undefined && [...last.matchAll(NEGATED)].some((match) => word.test(match[1]!))
  })
  return action ? `would ${action[0]}, which the user said not to do in this session` : undefined
}
