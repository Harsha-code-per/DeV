import "./cli/preflight"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import { ProvidersCommand } from "./cli/cmd/providers"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { UninstallCommand } from "./cli/cmd/uninstall"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { InstallationVersion } from "@dev-ai/core/installation/version"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
import { CatalogCommand } from "./cli/cmd/catalog"
import { ExportCommand } from "./cli/cmd/export"
import { ImportCommand } from "./cli/cmd/import"
import { AttachCommand } from "./cli/cmd/attach"
import { TuiThreadCommand } from "./cli/cmd/tui"
import { AcpCommand } from "./cli/cmd/acp"
import { EOL } from "os"
import fs from "fs"
import path from "path"
import { WebCommand } from "./cli/cmd/web"
import { PrCommand } from "./cli/cmd/pr"
import { SessionCommand } from "./cli/cmd/session"
import { DbCommand } from "./cli/cmd/db"
import { errorMessage } from "./util/error"
import { PluginCommand } from "./cli/cmd/plug"
import { NativeHostCommand } from "./cli/cmd/native-host"
import { Heap } from "./cli/heap"

// As in Claude Code, `devcode -p "prompt"` (or --print) runs headless: it is `devcode run`, with
// `--output-format json|stream-json` meaning `--format json` (JSON events, one per line).
const args = ((argv) => {
  if (argv[0] !== "-p" && argv[0] !== "--print") return argv
  const rest = argv.slice(1)
  return [
    "run",
    ...rest.map((arg, i) => {
      if (arg === "--output-format") return "--format"
      if (rest[i - 1] === "--output-format") return arg === "text" ? "default" : "json"
      return arg
    }),
  ]
})(hideBin(process.argv))

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("devcode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + EOL)
    return
  }
  process.stderr.write(out)
}

// DeV: MCP tools go through one code-mode `execute` tool by default instead of being sent
// individually (~107K → ~19K input tokens per request with the bundled servers), which keeps
// free models within their context windows. Set DEV_EXPERIMENTAL_CODE_MODE=false to opt out.
process.env.DEV_EXPERIMENTAL_CODE_MODE ??= "true"
// DeV: subagents can run in the background (task tool `background: true`), as in Claude Code.
process.env.DEV_EXPERIMENTAL_BACKGROUND_SUBAGENTS ??= "true"

// 1.0.x installed DeV Code a second time as `dev`, the DeV desktop app's name. An upgrade is run by
// the old binary, so the new one removes that leftover beside itself.
const leftover = path.join(path.dirname(process.execPath), process.platform === "win32" ? "dev.cmd" : "dev")
const ours =
  process.platform === "win32"
    ? fs.existsSync(leftover) && fs.readFileSync(leftover, "utf8").includes("devcode.exe")
    : fs.lstatSync(leftover, { throwIfNoEntry: false })?.isSymbolicLink() && fs.readlinkSync(leftover) === "devcode"
if (ours) fs.rmSync(leftover, { force: true })

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("devcode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    if (opts.printLogs) process.env.DEV_PRINT_LOGS = "1"
    if (opts.logLevel) process.env.DEV_LOG_LEVEL = opts.logLevel
    if (opts.pure) {
      process.env.DEV_PURE = "1"
    }

    Heap.start()

    process.env.AGENT = "1"
    process.env.DEVCODE = "1"
    process.env.DEV_PID = String(process.pid)
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(AcpCommand)
  .command(McpCommand)
  .command(CatalogCommand)
  .command(TuiThreadCommand)
  .command(AttachCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  .command(ProvidersCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  .command(WebCommand)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  .command(PrCommand)
  .command(SessionCommand)
  .command(PluginCommand)
  .command(DbCommand)
  .command(NativeHostCommand)
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
