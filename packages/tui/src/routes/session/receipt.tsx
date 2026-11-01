import { TextAttributes } from "@opentui/core"
import { Show } from "solid-js"
import { selectedForeground, useTheme } from "../../context/theme"
import { Locale } from "../../util/locale"
import type { Phase, Receipt } from "./turn"

const PHASE_NAME = { plan: "PLAN", do: "DO", verify: "VERIFY", done: "DONE" }

export function receiptIcon(ended: Receipt["ended"]) {
  return { done: "✓", failed: "✗", interrupted: "■" }[ended]
}

/** The facts under a finished prompt. Lines are omitted when there's nothing true to say. */
export function ReceiptLine(props: { receipt: Receipt; model: string; open: boolean; onToggle: () => void }) {
  const { theme } = useTheme()
  const files = () => `${props.receipt.files} ${props.receipt.files === 1 ? "file" : "files"}`
  return (
    <box flexDirection="row" flexWrap="wrap" paddingLeft={3}>
      <text fg={theme.textMuted}>
        <Show when={props.receipt.files > 0}>
          {files()} <span style={{ fg: theme.diffAdded }}>+{props.receipt.added}</span>{" "}
          <span style={{ fg: theme.diffRemoved }}>−{props.receipt.removed}</span>
          {" · "}
        </Show>
        <Show when={props.receipt.checks === "passed"}>
          <span style={{ fg: theme.success }}>checks pass</span>
          {" · "}
        </Show>
        <Show when={props.receipt.checks === "failed"}>
          <span style={{ fg: theme.error }}>checks failed</span>
          {" · "}
        </Show>
        <Show when={props.receipt.duration > 0}>
          {Locale.duration(props.receipt.duration)}
          {" · "}
        </Show>
        ${props.receipt.cost.toFixed(2)} · {props.model}
      </text>
      <Show when={props.receipt.steps > 0}>
        <box onMouseUp={props.onToggle}>
          <text fg={theme.primary}>
            {" "}
            {props.open ? "▾" : "▸"} {props.receipt.steps} {props.receipt.steps === 1 ? "step" : "steps"}
          </text>
        </box>
      </Show>
    </box>
  )
}

/** The bar that always says what DeV is doing right now. */
export function NowBar(props: { text: string; model: string; seconds: number; waiting: boolean }) {
  const { theme } = useTheme()
  const ink = () => selectedForeground(theme, theme.primary)
  return (
    <box flexDirection="row" flexShrink={0} backgroundColor={theme.primary} justifyContent="space-between">
      <text fg={ink()} wrapMode="none" attributes={TextAttributes.BOLD} flexShrink={1}>
        {" "}
        {props.waiting ? "WAITING" : "NOW"} · {props.text}
      </text>
      <text fg={ink()} wrapMode="none" flexShrink={0}>
        {props.model} · {props.seconds}s{" "}
      </text>
    </box>
  )
}

export function PhaseNode(props: { phase: Phase; current: boolean }) {
  const { theme } = useTheme()
  return (
    <box paddingLeft={1} marginTop={1} flexShrink={0}>
      <text fg={props.current ? theme.primary : theme.success} attributes={TextAttributes.BOLD}>
        {props.current ? "◉" : "●"} {PHASE_NAME[props.phase]}
      </text>
    </box>
  )
}

/** The steps still ahead of a live task, so the spine always shows where it's going. */
export function PhasesAhead(props: { after: Phase | undefined }) {
  const { theme } = useTheme()
  const order: (keyof typeof PHASE_NAME)[] = ["plan", "do", "verify", "done"]
  const ahead = () => order.slice(props.after ? order.indexOf(props.after) + 1 : 0)
  return (
    <box paddingLeft={1} marginTop={1} flexShrink={0}>
      <text fg={theme.textMuted}>{ahead().map((phase) => `○ ${PHASE_NAME[phase]}`).join("  ")}</text>
    </box>
  )
}
