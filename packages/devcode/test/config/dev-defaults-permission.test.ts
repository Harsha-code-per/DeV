import { describe, expect, test } from "bun:test"
import { Permission } from "@/permission"
import DevDefaults from "../../src/config/dev-defaults.json"

// DeV's bundled safe defaults, run through the real permission evaluator.
const rules = Permission.fromConfig(DevDefaults.permission as Parameters<typeof Permission.fromConfig>[0])
const bash = (command: string) => Permission.evaluate("bash", command, rules).action

describe("DeV default permissions", () => {
  test("file edits and web fetches ask", () => {
    expect(Permission.evaluate("edit", "src/app.ts", rules).action).toBe("ask")
    expect(Permission.evaluate("webfetch", "https://example.com", rules).action).toBe("ask")
  })

  test("read-only shell commands run without asking", () => {
    for (const command of ["ls", "ls -la src", "pwd", "git status", "git diff HEAD~1", "git log --oneline", "rg TODO", "cat README.md"])
      expect(bash(command), command).toBe("allow")
  })

  test("anything else asks", () => {
    for (const command of ["rm -rf build", "npm install", "curl https://example.com", "git push", "git commit -m x"])
      expect(bash(command), command).toBe("ask")
  })

  test("allowlisted commands still ask when they can write or run other programs", () => {
    for (const command of [
      "echo hi > ~/.bashrc",
      "cat secrets >> /tmp/out",
      "git diff --output=/tmp/x",
      "rg --pre sh pattern",
      "ls>listing.txt",
    ])
      expect(bash(command), command).toBe("ask")
  })
})
