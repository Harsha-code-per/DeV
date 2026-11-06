import { createResource } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { usePermission, type Refusal } from "../context/permission"

type Action = "allow" | "ask" | "deny"
type Rule = { permission: string; pattern: string; action: Action }
type Choice = { kind: "mode" } | { kind: "add" } | { kind: "refused"; refusal: Refusal } | { kind: "rule"; rule: Rule }

const CATEGORY: Record<Action, string> = { allow: "Allowed", ask: "Always ask", deny: "Never allowed" }

// Like Claude Code's /permissions: what auto mode refused, the rules, and a way to change them. Rules apply to the
// running project at once and are saved to the global dev.json.
export function DialogPermissions(props: { mode: string; onMode: () => void }) {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const sync = useSync()
  const permission = usePermission()
  // The project's config is cached until DeV restarts, so newly saved global rules come from the global config.
  const [global] = createResource(() => sdk.client.global.config.get().then((result) => result.data?.permission))

  const rules = () => {
    const merged = { ...flatten(sync.data.config.permission), ...flatten(global()) }
    return Object.values(merged)
  }

  const save = async (items: Rule[], directory?: string) => {
    for (const rule of items) {
      await sdk.client.permission.rule({ permissionRule: rule, directory }, { throwOnError: true })
    }
  }

  const choose = (rule: Omit<Rule, "action">, directory?: string, done?: () => void) =>
    dialog.replace(() => (
      <DialogSelect<Action>
        title={`${rule.permission}: ${rule.pattern}`}
        options={(["allow", "ask", "deny"] as const).map((action) => ({ value: action, title: CATEGORY[action] }))}
        onSelect={(option) => {
          dialog.clear()
          save([{ ...rule, action: option.value }], directory)
            .then(() => {
              done?.()
              toast.show({
                variant: "success",
                message: `${rule.permission} ${rule.pattern}: ${CATEGORY[option.value].toLowerCase()}`,
              })
            })
            .catch(toast.error)
        }}
      />
    ))

  const allowRefusal = (refusal: Refusal) => {
    const directory = sync.session.get(refusal.sessionID)?.directory
    const exact = refusal.patterns.join(", ")
    const broad = (refusal.always ?? []).join(", ")
    dialog.replace(() => (
      <DialogSelect<string[] | undefined>
        title={`Auto mode refused this because it ${refusal.risk}`}
        options={[
          // The broad pattern comes first: models often retry with small changes, such as adding 2>&1.
          ...(broad && broad !== exact ? [{ value: refusal.always, title: `Allow anything matching ${broad}` }] : []),
          { value: refusal.patterns, title: `Allow only ${exact}` },
          { value: undefined, title: "Keep refusing it" },
        ]}
        onSelect={(option) => {
          dialog.clear()
          if (!option.value) return
          save(
            option.value.map((pattern) => ({ permission: refusal.permission, pattern, action: "allow" as const })),
            directory,
          )
            .then(() => {
              permission.forget(refusal)
              toast.show({ variant: "success", message: "Allowed. Ask DeV to try again.", duration: 5000 })
            })
            .catch(toast.error)
        }}
      />
    ))
  }

  const add = async () => {
    const input = await DialogPrompt.show(dialog, "Add a rule", {
      placeholder: "Tool and pattern, e.g. bash git push --force*  or  edit src/**  or  webfetch",
    })
    const [tool, ...pattern] = (input ?? "").trim().split(/\s+/)
    if (!tool) return dialog.clear()
    choose({ permission: tool, pattern: pattern.join(" ") || "*" })
  }

  const options = () => [
    {
      value: { kind: "mode" } as Choice,
      title: `Mode: ${props.mode}`,
      description: "Change how DeV asks",
      category: "Mode",
    },
    ...permission.refused.map((refusal) => ({
      value: { kind: "refused", refusal } as Choice,
      title: `${refusal.permission}: ${refusal.patterns.join(", ")}`,
      description: refusal.risk,
      category: "Refused in auto mode (Enter to allow)",
    })),
    ...rules().map((rule) => ({
      value: { kind: "rule", rule } as Choice,
      title: `${rule.permission}: ${rule.pattern}`,
      category: CATEGORY[rule.action],
    })),
    {
      value: { kind: "add" } as Choice,
      title: "Add a rule…",
      description: "e.g. bash npm publish*",
      category: "Rules",
    },
  ]

  return (
    <DialogSelect<Choice>
      title="Permissions"
      placeholder="Search rules"
      options={options()}
      onSelect={(option) => {
        const choice = option.value
        if (choice.kind === "mode") return props.onMode()
        if (choice.kind === "add") return void add()
        if (choice.kind === "refused") return allowRefusal(choice.refusal)
        choose(choice.rule)
      }}
    />
  )
}

function flatten(config: string | Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(typeof config === "string" ? { "*": config } : (config ?? {})).flatMap(([permission, value]) =>
      typeof value === "string"
        ? [[`${permission}\n*`, { permission, pattern: "*", action: value as Action }]]
        : Object.entries((value ?? {}) as Record<string, Action>).map(([pattern, action]) => [
            `${permission}\n${pattern}`,
            { permission, pattern, action },
          ]),
    ),
  )
}
