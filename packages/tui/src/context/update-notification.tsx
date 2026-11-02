import { InstallationLocal, InstallationVersion } from "@dev-ai/core/installation/version"
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import CHANGELOG from "../../../../CHANGELOG.md" with { type: "text" }
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"
import { useExit } from "./exit"
import { useRoute } from "./route"
import { useDialog } from "../ui/dialog"
import { DialogAlert } from "../ui/dialog-alert"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"
import { DialogUpdate } from "../component/dialog-update"

export type UpdateTarget = { readonly type: "latest"; readonly version: string }

export type UpdateState =
  | { readonly type: "installing"; readonly target: UpdateTarget }
  | { readonly type: "installed"; readonly target: UpdateTarget }
  | { readonly type: "failed"; readonly target: UpdateTarget; readonly message: string }

export type UpdateNotice = { readonly type: "available"; readonly version: string }

// Implemented by the CLI process so checks and installs run against this machine's installation.
export type UpdateSource = {
  readonly subscribe: (notify: (notice: UpdateNotice) => void) => () => void
  readonly check: () => Promise<{ readonly current: string; readonly latest?: string }>
  readonly apply: (target: UpdateTarget) => Promise<void>
  /** Starts the updated DeV Code again once this one exits, back in the given session. */
  readonly restart?: (sessionID?: string) => void
}

// Skipping a version hides it until a newer one ships.
export function visibleNotice(notice: UpdateNotice | undefined, hidden: { readonly skippedVersion?: string }) {
  if (!notice) return undefined
  if (hidden.skippedVersion && !isVersionGreater(notice.version, hidden.skippedVersion)) return undefined
  return notice
}

export const { use: useUpdateNotification, provider: UpdateNotificationProvider } = createSimpleContext({
  name: "UpdateNotification",
  init: (props: { updater?: UpdateSource }) => {
    const kv = useKV()
    const dialog = useDialog()
    const exit = useExit()
    const toast = useToast()
    const route = useRoute()
    const [available, setAvailable] = createSignal<UpdateNotice>()
    const [state, setState] = createSignal<UpdateState>()

    // Checks only announce a version. Installing always goes through /update.
    onMount(() => {
      if (!props.updater) return
      onCleanup(props.updater.subscribe(setAvailable))
    })

    const notification = createMemo(() => {
      const current = state()
      if (current?.type === "installed") return current
      return visibleNotice(available(), { skippedVersion: kv.get("skipped_version") })
    })

    // Wherever the user is, a new version gets one toast; the home screen keeps a line for it.
    let announced: string | undefined
    createEffect(() => {
      const notice = notification()
      if (notice?.type !== "available" || notice.version === announced) return
      announced = notice.version
      toast.show({
        variant: "info",
        message: `DeV Code ${notice.version} is available. Type /update to install it.`,
        duration: 10_000,
      })
    })

    // The first start on a new version shows what changed since the version the user had. KVProvider
    // renders nothing until settings have loaded, so they are complete here.
    onMount(() => {
      if (InstallationLocal || InstallationVersion.startsWith("0.0.0")) return
      const seen = kv.get("seen_version") as string | undefined
      // Versions before 1.0.3 kept no record; anyone with settings is upgrading, not new.
      const upgraded = seen === undefined && Object.keys(kv.store).length > 0
      kv.set("seen_version", InstallationVersion)
      if (seen !== undefined && !isVersionGreater(InstallationVersion, seen)) return
      if (seen === undefined && !upgraded) return
      const changes = seen ? changesSince(seen, InstallationVersion) : changesSince("0", InstallationVersion).split("\n\n")[0]
      if (!changes) return
      setTimeout(
        () =>
          dialog.replace(() => (
            <DialogAlert title={`What's new in DeV Code ${InstallationVersion}`} message={changes} />
          )),
        800,
      )
    })

    const restart = () => {
      props.updater?.restart?.(route.data.type === "session" ? route.data.sessionID : undefined)
      exit()
    }

    const install = async (target: UpdateTarget) => {
      const updater = props.updater
      if (!updater || state()?.type === "installing") return
      setState({ type: "installing", target })
      await updater.apply(target).then(
        () => setState({ type: "installed", target }),
        (error: unknown) => setState({ type: "failed", target, message: errorMessage(error) }),
      )
    }

    const open = () => {
      const updater = props.updater
      if (!updater) return
      dialog.replace(() => (
        <DialogUpdate
          check={updater.check}
          state={state}
          install={install}
          skip={(version) => kv.set("skipped_version", version)}
          restart={restart}
        />
      ))
    }

    return {
      notification,
      open: props.updater ? open : undefined,
      restart,
    }
  },
})

/** The CHANGELOG entries for versions after `from`, up to and including `to`, as plain text. */
export function changesSince(from: string, to: string, changelog = CHANGELOG) {
  return changelog
    .split(/^## /m)
    .slice(1)
    .flatMap((section) => {
      const [heading, ...lines] = section.split("\n")
      const version = heading.split(" ")[0]
      if (!isVersionGreater(version, from) || isVersionGreater(version, to)) return []
      const body = lines
        .map((line) => line.replace(/\*\*|`/g, "").replace(/^- /, "• ").replace(/^### /, ""))
        .filter((line) => line.trim())
      return [[version, ...body].join("\n")]
    })
    .slice(0, 3)
    .join("\n\n")
}

export function isVersionGreater(left: string, right: string) {
  const parse = (value: string) => {
    const [core, prerelease] = value.replace(/^v/, "").split("-", 2)
    return { core: core.split(".").map((part) => Number.parseInt(part, 10) || 0), prerelease }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference) return difference > 0
  }
  if (a.prerelease === b.prerelease) return false
  if (!a.prerelease) return true
  if (!b.prerelease) return false
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true }) > 0
}
