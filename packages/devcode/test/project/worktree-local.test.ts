import { expect, test } from "bun:test"
import path from "path"
import { existsSync } from "fs"
import { enterWorktree, leaveWorktree } from "../../src/worktree/local"
import { tmpdir } from "../fixture/fixture"

test("a worktree with no changes is removed with its branch; one with changes is kept", async () => {
  await using dir = await tmpdir({ git: true })
  const branches = () => Bun.spawnSync(["git", "branch"], { cwd: dir.path }).stdout.toString()

  const clean = enterWorktree(dir.path, "clean one")
  if (clean instanceof Error) throw clean
  expect(clean.dir).toBe(path.join(dir.path, ".dev", "worktrees", "clean-one"))
  expect(clean.branch).toBe("devcode/clean-one")
  expect(leaveWorktree(clean)).toBe(true)
  expect(existsSync(clean.dir)).toBe(false)
  expect(branches()).not.toContain("devcode/clean-one")

  const changed = enterWorktree(dir.path, "changed")
  if (changed instanceof Error) throw changed
  await Bun.write(path.join(changed.dir, "new.ts"), "export {}\n")
  expect(leaveWorktree(changed)).toBe(false)
  expect(existsSync(path.join(changed.dir, "new.ts"))).toBe(true)
  // The main checkout stays clean: the worktrees folder ignores itself.
  expect(Bun.spawnSync(["git", "status", "--porcelain"], { cwd: dir.path }).stdout.toString()).toBe("")
})
