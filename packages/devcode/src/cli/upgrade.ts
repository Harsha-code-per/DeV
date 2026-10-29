import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Flag } from "@dev-ai/core/flag/flag"
import { Installation } from "@/installation"
import { InstallationVersion } from "@dev-ai/core/installation/version"

// Checking never installs anything. Updates only happen when the user runs `/update` or `devcode upgrade`.
export function shouldNotify(input: {
  autoupdate: boolean | "notify" | undefined
  disabled: boolean
  always: boolean
  current: string
  latest: string
}) {
  if (input.autoupdate === false || input.disabled) return false
  if (input.always) return true
  return Installation.isUpdate(input.current, input.latest)
}

// Returns undefined when checks are disabled, fail, or find nothing newer.
export async function upgrade() {
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  if (config.autoupdate === false || Flag.DEV_DISABLE_AUTOUPDATE) return
  const latest = await Installation.latest(await Installation.method()).catch(() => {})
  if (!latest) return
  if (
    shouldNotify({
      autoupdate: config.autoupdate,
      disabled: Flag.DEV_DISABLE_AUTOUPDATE,
      always: Flag.DEV_ALWAYS_NOTIFY_UPDATE,
      current: InstallationVersion,
      latest,
    })
  )
    return { type: "available" as const, version: latest }
}
