import path from "path"
import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import { createSignal, onCleanup } from "solid-js"
import { useKV } from "../../context/kv"
import { DialogSelect } from "../../ui/dialog-select"
import { useDialog } from "../../ui/dialog"
import { useToast } from "../../ui/toast"
import { Voice } from "../../voice"

type State = "idle" | "warmup" | "listening" | "transcribing" | "installing"

// Terminals report a held key only as rapid repeats, so a hold is a few spaces within REPEAT_MS of
// each other, and it ends when the repeats stop for RELEASE_MS. Kitty-protocol terminals also send
// a release event, which stops at once.
const REPEAT_MS = 120
const RELEASE_MS = 400
const MAX_MS = 2 * 60_000

/** Push-to-talk for the prompt: /voice turns it on, then holding Space records and inserts the words. */
export function usePromptVoice(input: () => TextareaRenderable | undefined) {
  const kv = useKV()
  const dialog = useDialog()
  const toast = useToast()
  const [state, setState] = createSignal<State>("idle")
  const [level, setLevel] = createSignal(0)
  const [ready, setReady] = createSignal(false)
  const [progress, setProgress] = createSignal("")
  const engine = () => kv.get("voice", "off") as "off" | Voice.Engine

  let recording: Voice.Recording | undefined
  let last = 0
  let streak = 0
  let typed = 0
  let started = 0
  let run = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let warmup: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    clearInterval(timer)
    recording?.cancel()
  })

  function begin() {
    const target = input()
    if (!target) return
    // The spaces typed before the hold was recognised come back out.
    const before = target.plainText.slice(0, target.cursorOffset)
    const spaces = Math.min(typed, before.length - before.trimEnd().length)
    for (let i = 0; i < spaces; i++) target.deleteCharBackward()
    try {
      recording = Voice.record()
    } catch (error) {
      fail(error)
      return
    }
    setReady(false)
    setState("listening")
    started = performance.now()
    timer = setInterval(() => {
      setReady(recording?.ready() ?? false)
      setLevel(recording?.level() ?? 0)
      const now = performance.now()
      if (now - last > RELEASE_MS || now - started > MAX_MS) void finish()
    }, 50)
  }

  async function finish() {
    clearInterval(timer)
    const current = recording
    recording = undefined
    if (!current) return
    const id = ++run
    setState("transcribing")
    try {
      const text = await Voice.transcribe(await current.stop(), engine() === "cloud" ? "cloud" : "local", [
        path.basename(process.cwd()),
      ])
      if (id !== run) return
      setState("idle")
      if (!text) {
        toast.show({ variant: "info", message: "No speech heard. Hold Space while you talk.", duration: 3000 })
        return
      }
      const target = input()
      if (!target) return
      const before = target.plainText.slice(0, target.cursorOffset)
      target.insertText((before && !/\s$/.test(before) ? " " : "") + text)
    } catch (error) {
      if (id === run) fail(error)
    }
  }

  function cancel() {
    clearInterval(timer)
    run++
    recording?.cancel()
    recording = undefined
    setState("idle")
  }

  function fail(error: unknown) {
    setState("idle")
    toast.show({ variant: "error", message: error instanceof Error ? error.message : String(error), duration: 6000 })
  }

  /** Call first in the prompt's key handler; returns true when voice took the key. */
  function onKey(event: KeyEvent) {
    if (engine() === "off") return false
    const current = state()
    if (event.name === "escape" && (current === "listening" || current === "transcribing")) {
      event.preventDefault()
      cancel()
      return true
    }
    if (event.name !== "space" || event.ctrl || event.meta || event.option || event.shift) return false
    const now = performance.now()
    if (current === "listening") {
      event.preventDefault()
      last = now
      if (event.eventType === "release") void finish()
      return true
    }
    if (current === "transcribing" || current === "installing" || event.eventType === "release") return false
    typed = now - last < 700 ? typed + 1 : 1
    streak = now - last < REPEAT_MS ? streak + 1 : 1
    last = now
    clearTimeout(warmup)
    if (streak < 3) {
      if (streak === 2) setState("warmup")
      // A quick double tap is just two spaces.
      warmup = setTimeout(() => state() === "warmup" && setState("idle"), REPEAT_MS * 2)
      return false
    }
    event.preventDefault()
    typed--
    begin()
    return true
  }

  async function enable(choice: "off" | Voice.Engine) {
    dialog.clear()
    if (choice === "off") {
      cancel()
      kv.set("voice", "off")
      toast.show({ variant: "info", message: "Voice is off", duration: 2500 })
      return
    }
    if (choice === "cloud") {
      const provider = await Voice.cloudProvider()
      if (!provider) {
        toast.show({
          variant: "warning",
          message: "Cloud voice needs Groq (free) or OpenAI connected. Run /connect first.",
          duration: 6000,
        })
        return
      }
    }
    await Voice.prepare().catch(() => {})
    if (choice === "local" && !(await Voice.localInstalled())) {
      setState("installing")
      try {
        await Voice.installLocal(setProgress)
      } catch (error) {
        fail(error)
        return
      } finally {
        setProgress("")
      }
      setState("idle")
    }
    kv.set("voice", choice)
    toast.show({
      variant: "success",
      message: `Voice is on (${choice === "local" ? "on this computer" : "cloud"}). Hold Space to talk, release to stop. Esc cancels.`,
      duration: 6000,
    })
  }

  function open() {
    const local = Voice.localSupported()
    dialog.replace(() => (
      <DialogSelect<"off" | Voice.Engine>
        title="Voice"
        flat={true}
        current={engine() === "off" ? "local" : engine()}
        options={[
          {
            value: "local",
            title: "On, on this computer (Recommended)",
            description: local
              ? "Free, private and offline. Downloads about 130 MB the first time."
              : "Not available for this computer; use cloud.",
            disabled: !local,
            onSelect: () => void enable("local"),
          },
          {
            value: "cloud",
            title: "On, cloud",
            description: "Uses Groq (free tier) or OpenAI if connected. More languages; audio goes to that provider.",
            onSelect: () => void enable("cloud"),
          },
          { value: "off", title: "Off", onSelect: () => void enable("off") },
        ]}
      />
    ))
  }

  /** The line shown under the prompt while voice is busy. */
  function status() {
    const current = state()
    if (current === "installing") return progress() || "Preparing voice…"
    if (current === "warmup") return "keep holding…"
    if (current === "transcribing") return "transcribing…"
    if (current !== "listening") return
    if (!ready()) return "starting the microphone…"
    const bars = "▁▂▃▄▅▆▇█"
    const meter = [0.6, 1, 0.8]
      .map((weight) => bars[Math.min(bars.length - 1, Math.floor(level() * weight * bars.length))])
      .join("")
    return `● listening ${meter}  release Space to stop · esc cancels`
  }

  return { onKey, open, status, enabled: () => engine() !== "off", listening: () => state() === "listening" }
}
