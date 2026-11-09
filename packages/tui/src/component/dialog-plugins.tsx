import { createMemo, createResource, createSignal } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import { useSDK } from "../context/sdk"

type Scope = "user" | "project" | "local"
type Choice =
  | { kind: "installed"; id: string; enabled: boolean; scope?: Scope }
  | { kind: "available"; id: string }
  | { kind: "marketplace"; name: string }
  | { kind: "add" }

const SCOPES: { value: Scope; title: string; description: string }[] = [
  { value: "user", title: "For me, in every project", description: "saved in your user settings" },
  { value: "project", title: "For everyone on this repo", description: "saved in .dev/dev.json, which you commit" },
  { value: "local", title: "For me, in this repo only", description: "saved in .dev/dev.local.json, kept out of git" },
]

const APPLIES = "It applies once running work finishes."

const DISCOVER_LIMIT = 100

const KIND: Record<string, string> = { plugin: "plugin", skill: "skill", mcp: "MCP server" }

function stars(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)
}

// /plugins: plugins from the marketplaces you've added (installed ones first), and the marketplaces themselves.
// Typing filters the whole list, so it doubles as search.
export function DialogPlugins() {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  dialog.setSize("large")

  const [data] = createResource(async () => {
    const [available, installed, marketplaces] = await Promise.all([
      sdk.client.plugins.available({}, { throwOnError: true }).then((result) => result.data ?? []),
      sdk.client.plugins.installed({}, { throwOnError: true }).then((result) => result.data ?? []),
      sdk.client.plugins.marketplaces({}, { throwOnError: true }).then((result) => result.data ?? []),
    ])
    return { available, installed, marketplaces }
  })

  const reopen = () => dialog.replace(() => <DialogPlugins />)
  const fail = (error: unknown) => toast.error(error)

  const [query, setQuery] = createSignal("")

  // Search names and descriptions, keeping the list's order (installed, then Verified, then most stars) so the
  // best-known match comes first, not the closest name.
  const options = () => {
    const words = query().toLowerCase().split(/\s+/).filter(Boolean)
    const matches = all().filter((option) =>
      words.every((word) => `${option.title} ${option.description ?? ""}`.toLowerCase().includes(word)),
    )
    // The terminal UI stalls redrawing thousands of rows, so Discover shows the top matches; typing narrows the rest.
    const shown = new Set(matches.filter((option) => option.category === "Discover").slice(0, DISCOVER_LIMIT))
    return matches.filter((option) => option.category !== "Discover" || shown.has(option))
  }

  // Built once per load: filtering returns the same row objects, so the list reuses its rows instead of
  // redrawing thousands of them on every keystroke (which froze the dialog).
  const all = createMemo((): DialogSelectOption<Choice>[] => {
    const value = data()
    if (!value) return []
    const installedIds = new Set(value.installed.map((item) => item.id))
    return [
      ...value.installed.map((item) => ({
        value: { kind: "installed", id: item.id, enabled: item.enabled, scope: item.scope } as Choice,
        title: `${item.enabled ? "●" : "○"} ${item.id}`,
        description: `${item.version}${item.scope ? ` · ${item.scope}` : ""}${item.enabled ? "" : " · off"}`,
        category: "Installed",
      })),
      ...value.available
        .filter((entry) => !installedIds.has(entry.id))
        .toSorted(
          (a, b) => Number(b.verified ?? 0) - Number(a.verified ?? 0) || Number(b.stars ?? 0) - Number(a.stars ?? 0),
        )
        .map((entry) => ({
          value: { kind: "available", id: entry.id } as Choice,
          title: entry.id,
          description: [
            entry.stars !== undefined ? `★ ${stars(Number(entry.stars))}` : undefined,
            KIND[entry.kind ?? ""],
            entry.verified ? "Verified" : undefined,
            entry.description,
          ]
            .filter(Boolean)
            .join(" · "),
          category: "Discover",
        })),
      ...value.marketplaces.map((item) => ({
        value: { kind: "marketplace", name: item.name } as Choice,
        title: item.name,
        description: `${item.plugins} plugins · ${item.source}`,
        category: "Marketplaces",
      })),
      {
        value: { kind: "add" } as Choice,
        title: "Add a marketplace…",
        description: "owner/repo, a git URL, a URL to marketplace.json, or a folder",
        category: "Marketplaces",
      },
    ]
  })

  const addMarketplace = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Add a plugin marketplace"
        placeholder="owner/repo"
        description={() => <text>owner/repo (add #tag to pin), a git URL, a URL to marketplace.json, or a folder</text>}
        onConfirm={(source) => {
          if (!source.trim()) return reopen()
          toast.show({ variant: "info", message: `Adding ${source}…` })
          sdk.client.plugins.marketplace
            .add({ source: source.trim() }, { throwOnError: true })
            .then((result) => {
              toast.show({
                variant: "success",
                message: `Added ${result.data?.name} with ${result.data?.plugins} plugins`,
              })
              reopen()
            })
            .catch(fail)
        }}
        onCancel={reopen}
      />
    ))

  const install = (id: string) =>
    dialog.replace(() => (
      <DialogSelect<Scope>
        title={`Install ${id}`}
        options={SCOPES}
        onSelect={(option) => {
          toast.show({ variant: "info", message: `Installing ${id}…` })
          sdk.client.plugins
            .install({ id, scope: option.value }, { throwOnError: true })
            .then((result) => {
              const contents = result.data?.contents
              const parts = contents
                ? [
                    contents.skills && count(contents.skills, "skill"),
                    contents.commands && count(contents.commands, "command"),
                    contents.agents && count(contents.agents, "agent"),
                    contents.hooks && `${count(contents.hooks, "hook")} that run commands`,
                    contents.mcp.length > 0 && `MCP: ${contents.mcp.join(", ")}`,
                  ].filter(Boolean)
                : []
              toast.show({
                variant: "success",
                message: `${result.data?.message}. ${parts.length > 0 ? `Adds ${parts.join(", ")}. ` : ""}${APPLIES}`,
                duration: 8000,
              })
              reopen()
            })
            .catch(fail)
        }}
      />
    ))

  const manage = (item: Extract<Choice, { kind: "installed" }>) => {
    const scope = item.scope ?? "user"
    const actions = [
      { value: "toggle", title: item.enabled ? "Turn off" : "Turn on", description: `in ${scope} scope` },
      { value: "update", title: "Update", description: "to the version its marketplace lists now" },
      { value: "uninstall", title: "Uninstall", description: `remove from ${scope} scope` },
    ] as const
    dialog.replace(() => (
      <DialogSelect<(typeof actions)[number]["value"]>
        title={item.id}
        options={[...actions]}
        onSelect={(option) => {
          const request =
            option.value === "toggle"
              ? sdk.client.plugins.enable({ id: item.id, scope, enabled: !item.enabled }, { throwOnError: true })
              : option.value === "update"
                ? sdk.client.plugins.update({ id: item.id }, { throwOnError: true })
                : sdk.client.plugins.uninstall({ id: item.id, scope }, { throwOnError: true })
          request
            .then((result) => {
              toast.show({ variant: "success", message: `${result.data?.message}. ${APPLIES}` })
              reopen()
            })
            .catch(fail)
        }}
      />
    ))
  }

  const manageMarketplace = (name: string) =>
    dialog.replace(() => (
      <DialogSelect<"update" | "remove">
        title={name}
        options={[
          { value: "update", title: "Update", description: "fetch its latest plugin list" },
          { value: "remove", title: "Remove", description: "and uninstall the plugins from it" },
        ]}
        onSelect={(option) => {
          const request =
            option.value === "update"
              ? sdk.client.plugins.marketplace.update({ name }, { throwOnError: true })
              : sdk.client.plugins.marketplace.remove({ name }, { throwOnError: true })
          request
            .then(() => {
              toast.show({
                variant: "success",
                message: option.value === "update" ? `Updated ${name}` : `Removed ${name}`,
              })
              reopen()
            })
            .catch(fail)
        }}
      />
    ))

  return (
    <DialogSelect<Choice>
      title="Plugins"
      placeholder={`Search ${(data()?.available.length ?? 0).toLocaleString()} plugins`}
      options={options()}
      skipFilter
      onFilter={setQuery}
      emptyView={<text>{data.loading ? "Loading plugins…" : "Nothing here yet."}</text>}
      onSelect={(option) => {
        const choice = option.value
        if (choice.kind === "add") return addMarketplace()
        if (choice.kind === "available") return install(choice.id)
        if (choice.kind === "installed") return manage(choice)
        return manageMarketplace(choice.name)
      }}
    />
  )
}

function count(n: number | string, word: string) {
  return `${n} ${word}${Number(n) === 1 ? "" : "s"}`
}
