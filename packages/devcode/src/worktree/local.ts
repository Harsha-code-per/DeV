import path from "path"
import { existsSync, mkdirSync, writeFileSync } from "fs"

// Git worktrees under <repo>/.dev/worktrees/<name> on branch devcode/<name>, for `devcode -w` and for subagents
// with `isolation: worktree`. Removed when nothing changed, kept (with its branch) otherwise.
// ponytail: synchronous git calls; `git worktree add` on a huge repo blocks for its duration.

export type LocalWorktree = { root: string; dir: string; branch: string; base: string; name: string }

/** Creates the worktree, or reuses it when it already exists. */
export function enterWorktree(directory: string, requested: string): LocalWorktree | Error {
  const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: directory })
  const top = git("rev-parse", "--show-toplevel")
  if (top.exitCode !== 0) return new Error("A worktree needs a git repository")
  const root = top.stdout.toString().trim()
  const name =
    requested
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `session-${Date.now().toString(36)}`
  const dir = path.join(root, ".dev", "worktrees", name)
  const branch = `devcode/${name}`
  const base = git("rev-parse", "HEAD").stdout.toString().trim()
  if (existsSync(dir)) return { root, dir, branch, base, name }
  mkdirSync(path.dirname(dir), { recursive: true })
  // Ignores the worktrees folder itself, so the main checkout's git status stays clean.
  writeFileSync(path.join(path.dirname(dir), ".gitignore"), "*\n")
  const existing = git("show-ref", "--verify", "--quiet", `refs/heads/${branch}`).exitCode === 0
  const made = git("worktree", "add", ...(existing ? [dir, branch] : ["-b", branch, dir, "HEAD"]))
  if (made.exitCode !== 0) return new Error(made.stderr.toString().trim() || "Could not create the worktree")
  return { root, dir, branch, base, name }
}

/** Removes the worktree and its branch when it has no changes or commits; returns whether it did. */
export function leaveWorktree(worktree: LocalWorktree) {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", ...args], { cwd })
      .stdout.toString()
      .trim()
  const dirty = git(worktree.dir, "status", "--porcelain")
  const commits = git(worktree.root, "rev-list", "--count", `${worktree.base}..${worktree.branch}`)
  if (dirty || commits !== "0") return false
  git(worktree.root, "worktree", "remove", worktree.dir)
  git(worktree.root, "branch", "-D", worktree.branch)
  return true
}
