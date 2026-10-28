import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["DEV_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["DEV_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("DEV_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  DEV_AUTO_HEAP_SNAPSHOT: truthy("DEV_AUTO_HEAP_SNAPSHOT"),
  DEV_GIT_BASH_PATH: process.env["DEV_GIT_BASH_PATH"],
  DEV_CONFIG: process.env["DEV_CONFIG"],
  DEV_CONFIG_CONTENT: process.env["DEV_CONFIG_CONTENT"],
  DEV_DISABLE_AUTOUPDATE: truthy("DEV_DISABLE_AUTOUPDATE"),
  DEV_ALWAYS_NOTIFY_UPDATE: truthy("DEV_ALWAYS_NOTIFY_UPDATE"),
  DEV_DISABLE_PRUNE: truthy("DEV_DISABLE_PRUNE"),
  DEV_DISABLE_TERMINAL_TITLE: truthy("DEV_DISABLE_TERMINAL_TITLE"),
  DEV_SHOW_TTFD: truthy("DEV_SHOW_TTFD"),
  DEV_DISABLE_AUTOCOMPACT: truthy("DEV_DISABLE_AUTOCOMPACT"),
  DEV_DISABLE_MODELS_FETCH: truthy("DEV_DISABLE_MODELS_FETCH"),
  DEV_DISABLE_MOUSE: truthy("DEV_DISABLE_MOUSE"),
  DEV_FAKE_VCS: process.env["DEV_FAKE_VCS"],
  DEV_SERVER_PASSWORD: process.env["DEV_SERVER_PASSWORD"],
  DEV_SERVER_USERNAME: process.env["DEV_SERVER_USERNAME"],
  DEV_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("DEV_DISABLE_FFF"),

  // Experimental
  DEV_EXPERIMENTAL_FILEWATCHER: Config.boolean("DEV_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  DEV_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("DEV_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  DEV_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("DEV_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  DEV_MODELS_URL: process.env["DEV_MODELS_URL"],
  DEV_MODELS_PATH: process.env["DEV_MODELS_PATH"],
  DEV_DB: process.env["DEV_DB"],

  DEV_WORKSPACE_ID: process.env["DEV_WORKSPACE_ID"],
  DEV_EXPERIMENTAL_WORKSPACES: enabledByExperimental("DEV_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get DEV_DISABLE_MCP_LAZY() {
    return truthy("DEV_DISABLE_MCP_LAZY")
  },
  get DEV_DISABLE_DEV_DEFAULTS() {
    return truthy("DEV_DISABLE_DEV_DEFAULTS")
  },
  get DEV_DISABLE_PROJECT_CONFIG() {
    return truthy("DEV_DISABLE_PROJECT_CONFIG")
  },
  get DEV_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("DEV_EXPERIMENTAL_REFERENCES")
  },
  get DEV_TUI_CONFIG() {
    return process.env["DEV_TUI_CONFIG"]
  },
  get DEV_CONFIG_DIR() {
    return process.env["DEV_CONFIG_DIR"]
  },
  get DEV_PURE() {
    return truthy("DEV_PURE")
  },
  get DEV_PERMISSION() {
    return process.env["DEV_PERMISSION"]
  },
  get DEV_PLUGIN_META_FILE() {
    return process.env["DEV_PLUGIN_META_FILE"]
  },
  get DEV_CLIENT() {
    return process.env["DEV_CLIENT"] ?? "cli"
  },
}
