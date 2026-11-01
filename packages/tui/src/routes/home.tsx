import { Prompt, type PromptRef } from "../component/prompt"
import { TextAttributes } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRoute, useRouteData } from "../context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { usePluginRuntime } from "../plugin/runtime"
import { useEditorContext } from "../context/editor"
import { HomeSessionDestinationProvider } from "./home/session-destination"
import { useUpdateNotification } from "../context/update-notification"
import { selectedForeground, useTheme } from "../context/theme"
import { useDirectory } from "../context/directory"
import { Locale } from "../util/locale"
import { useExit } from "../context/exit"

let once = false
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  let sent = false

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <HomeSessionDestinationProvider>
      <pluginRuntime.Slot name="home_logo" mode="replace">
        <HomeBand />
      </pluginRuntime.Slot>
      <box flexGrow={1} paddingLeft={2} paddingRight={2}>
        <box height={1} minHeight={0} flexShrink={1} />
        <Greeting />
        <Earlier />
        <UpdateNotification />
        <box width="100%" zIndex={1000} paddingTop={1} flexShrink={0}>
          <pluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
            <Prompt ref={bind} right={<pluginRuntime.Slot name="home_prompt_right" />} placeholders={placeholder} />
          </pluginRuntime.Slot>
        </box>
        <pluginRuntime.Slot name="home_bottom" />
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <pluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </HomeSessionDestinationProvider>
  )
}

// DeV's screens open with a saffron band instead of a centred logo.
function HomeBand() {
  const { theme } = useTheme()
  const directory = useDirectory()
  const ink = () => selectedForeground(theme, theme.primary)
  return (
    <box flexShrink={0} backgroundColor={theme.primary} paddingLeft={2} paddingTop={1} paddingBottom={1}>
      <text fg={ink()} attributes={TextAttributes.BOLD}>
        D e V
      </text>
      <text fg={ink()}>{directory()}</text>
    </box>
  )
}

// Your last tasks here, so home shows where you left off.
function Earlier() {
  const { theme } = useTheme()
  const sync = useSync()
  const route = useRoute()
  const sessions = createMemo(() =>
    sync.data.session
      .filter((session) => !session.parentID)
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .slice(0, 3),
  )
  return (
    <Show when={sessions().length > 0}>
      <box flexShrink={0} paddingTop={1}>
        <text fg={theme.textMuted}>Earlier</text>
        <For each={sessions()}>
          {(session) => (
            <box onMouseUp={() => route.navigate({ type: "session", sessionID: session.id })}>
              <text fg={theme.text} wrapMode="none">
                <span style={{ fg: theme.primary }}>▸</span> {Locale.truncate(session.title, 60)}{" "}
                <span style={{ fg: theme.textMuted }}>{Locale.todayTimeOrDateTime(session.time.updated)}</span>
              </text>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

// DeV greets you like an assistant would, by the time of day.
function Greeting() {
  const { theme } = useTheme()
  const hour = new Date().getHours()
  const part = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  return (
    <box flexShrink={0} paddingTop={1}>
      <text fg={theme.textMuted}>
        {part}. <span style={{ fg: theme.text }}>What are we building?</span>
      </text>
    </box>
  )
}

function UpdateNotification() {
  const update = useUpdateNotification()
  const exit = useExit()
  const { theme } = useTheme()
  const [hovered, setHovered] = createSignal(false)
  createEffect(() => {
    update.notification()
    setHovered(false)
  })

  return (
    <Show when={update.notification()} keyed>
      {(state) => (
        <box
          flexShrink={0}
          flexDirection="row"
          gap={1}
          backgroundColor={hovered() ? theme.backgroundElement : undefined}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          onMouseUp={() => {
            if (state.type === "installed") return exit()
            update.open?.()
          }}
        >
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.primary }}>{state.type === "installed" ? "/exit" : "/update"}</span>
            {state.type === "available" ? ` to install v${state.version}` : ` restart to use v${state.target.version}`}
          </text>
        </box>
      )}
    </Show>
  )
}
