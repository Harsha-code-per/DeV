import fs from "fs/promises"
import path from "path"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { Process } from "@/util/process"
import WORKFLOW from "./github-workflow.txt"

// `devcode github install` adds the @devcode workflow to the repository: mention @devcode in an issue or pull
// request and DeV Code works on it in GitHub Actions, then opens a pull request or pushes, and replies.

export const GithubCommand = cmd({
  command: "github <action>",
  describe: "set up @devcode in your GitHub repository's issues and pull requests",
  builder: (yargs) =>
    yargs
      .positional("action", { type: "string", choices: ["install"], describe: "install: add the workflow" })
      .option("force", { type: "boolean", default: false, describe: "replace an existing devcode.yml" }),
  handler: async (args) => {
    const root = await Process.text(["git", "rev-parse", "--show-toplevel"], { nothrow: true }).then((result) =>
      result.code === 0 ? result.text.trim() : undefined,
    )
    if (!root) {
      UI.error("Run this inside a git repository.")
      process.exitCode = 1
      return
    }
    const file = path.join(root, ".github", "workflows", "devcode.yml")
    if (!args.force && (await Bun.file(file).exists())) {
      UI.error(`${path.relative(process.cwd(), file)} already exists. Use --force to replace it.`)
      process.exitCode = 1
      return
    }
    await fs.mkdir(path.dirname(file), { recursive: true })
    await Bun.write(file, WORKFLOW)
    const relative = path.relative(process.cwd(), file)
    UI.println(`Wrote ${relative}`)
    UI.empty()
    UI.println("Next:")
    UI.println(`  1. Commit and push it: git add ${relative} && git commit -m "Add DeV Code" && git push`)
    UI.println("  2. Add an AI provider key as a repository secret. A free one is enough, for example:")
    UI.println("       gh secret set GROQ_API_KEY       (or OPENROUTER_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, NVIDIA_API_KEY…)")
    UI.println("  3. Comment `@devcode fix this` on an issue or pull request.")
    UI.empty()
    UI.println(
      UI.Style.TEXT_DIM +
        "Only people with write access can start it. It uses DeV Auto (free models); set a DEVCODE_MODEL repository variable for another model." +
        UI.Style.TEXT_NORMAL,
    )
  },
})
