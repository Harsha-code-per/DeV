import { Effect } from "effect"
import { UI } from "../ui"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@dev-ai/core/flag/flag"
import { ServerAuth } from "@/server/auth"
import { openUrl } from "@dev-ai/core/open"
import { networkInterfaces } from "os"

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      // Skip internal and non-IPv4 addresses
      if (netInfo.internal || netInfo.family !== "IPv4") continue

      // Skip Docker bridge networks (typically 172.x.x.x)
      if (netInfo.address.startsWith("172.")) continue

      results.push(netInfo.address)
    }
  }

  return results
}

export const WebCommand = effectCmd({
  command: "web",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "start dev server and open web interface",
  // Server loads instances per-request via x-opencode-directory header — no
  // ambient project InstanceContext needed at startup.
  instance: false,
  handler: Effect.fn("Cli.web")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    const opts = yield* resolveNetworkOptions(args)
    const password = ServerAuth.ensurePassword()
    const server = yield* Effect.promise(() => Server.listen(opts))
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    // The web app reads its startup credentials from auth_token and then drops it from the address bar.
    const withAuth = (url: string) => {
      const result = new URL(url)
      result.searchParams.set(
        "auth_token",
        Buffer.from(`${ServerAuth.displayUsername()}:${Flag.DEV_SERVER_PASSWORD}`).toString("base64"),
      )
      return result.toString()
    }
    if (password) {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Username:          ", UI.Style.TEXT_NORMAL, ServerAuth.displayUsername())
      UI.println(
        UI.Style.TEXT_INFO_BOLD + "  Password:          ",
        UI.Style.TEXT_NORMAL,
        `${password}  (generated; set DEV_SERVER_PASSWORD to choose your own)`,
      )
    }

    if (opts.hostname === "0.0.0.0") {
      // Show localhost for local access
      const localhostUrl = `http://localhost:${server.port}`
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, localhostUrl)

      // Show network IPs for remote access
      const networkIPs = getNetworkIPs()
      if (networkIPs.length > 0) {
        for (const ip of networkIPs) {
          UI.println(
            UI.Style.TEXT_INFO_BOLD + "  Network access:    ",
            UI.Style.TEXT_NORMAL,
            `http://${ip}:${server.port}`,
          )
        }
      }

      if (opts.mdns) {
        UI.println(
          UI.Style.TEXT_INFO_BOLD + "  mDNS:              ",
          UI.Style.TEXT_NORMAL,
          `${opts.mdnsDomain}:${server.port}`,
        )
      }

      // Open localhost in browser
      openUrl(withAuth(localhostUrl)).catch(() => {})
    } else {
      const displayUrl = server.url.toString()
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, displayUrl)
      openUrl(withAuth(displayUrl)).catch(() => {})
    }

    yield* Effect.never
  }),
})
