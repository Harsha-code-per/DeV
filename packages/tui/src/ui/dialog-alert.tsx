import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { useBindings } from "../keymap"

export type DialogAlertProps = {
  title: string
  message: string
  onConfirm?: () => void
}

export function DialogAlert(props: DialogAlertProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  // The dialog starts a quarter of the way down; the title, button and padding take 7 rows, plus one to spare. A long
  // message (What's new after an update) scrolls instead of pushing the ok button off the screen.
  const height = () => Math.max(3, Math.floor((dimensions().height * 3) / 4) - 8)
  let scroll: ScrollBoxRenderable | undefined
  const by = (rows: number) => () => scroll?.scrollBy(rows)

  useBindings(() => ({
    bindings: [
      { key: "up", desc: "Scroll up", group: "Dialog", cmd: by(-1) },
      { key: "down", desc: "Scroll down", group: "Dialog", cmd: by(1) },
      { key: "pageup", desc: "Scroll up a page", group: "Dialog", cmd: () => scroll?.scrollBy(-height()) },
      { key: "pagedown", desc: "Scroll down a page", group: "Dialog", cmd: () => scroll?.scrollBy(height()) },
      {
        key: "return",
        desc: "Confirm alert",
        group: "Dialog",
        cmd: () => {
          props.onConfirm?.()
          dialog.clear()
        },
      },
    ],
  }))
  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <scrollbox ref={(item: ScrollBoxRenderable) => (scroll = item)} maxHeight={height()} marginBottom={1}>
        <text fg={theme.textMuted} wrapMode="word">
          {props.message}
        </text>
      </scrollbox>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box
          paddingLeft={3}
          paddingRight={3}
          backgroundColor={theme.primary}
          onMouseUp={() => {
            props.onConfirm?.()
            dialog.clear()
          }}
        >
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}

DialogAlert.show = (dialog: DialogContext, title: string, message: string) => {
  return new Promise<void>((resolve) => {
    dialog.replace(
      () => <DialogAlert title={title} message={message} onConfirm={() => resolve()} />,
      () => resolve(),
    )
  })
}
