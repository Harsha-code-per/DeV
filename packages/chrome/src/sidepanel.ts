import { wrap } from "./untrusted"

// Page text past this is dropped to keep prompts small.
const PAGE_LIMIT = 20_000

type Reply = { id: number; status: number; body: unknown }
type Part = { type: string; text?: string; synthetic?: boolean }
type Message = { info: { role: string; error?: { name?: string; data?: { message?: string } } }; parts: Part[] }

const list = document.getElementById("messages")!
const input = document.getElementById("input") as HTMLTextAreaElement
const button = document.getElementById("send") as HTMLButtonElement
const usePage = document.getElementById("use-page") as HTMLInputElement
const pageLabel = document.getElementById("page")!
const status = document.getElementById("status")!

const pending = new Map<number, (reply: Reply) => void>()
let port: chrome.runtime.Port | undefined
let session: string | undefined
let page: chrome.tabs.Tab | undefined
let busy = false
let requests = 0
let renders = 0

const refreshPage = () =>
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    page = tab
    pageLabel.textContent = tab?.title ? `· ${tab.title}` : ""
  })
chrome.tabs.onActivated.addListener(refreshPage)
chrome.tabs.onUpdated.addListener(refreshPage)
refreshPage()

button.addEventListener("click", () => (busy ? stop() : send()))
input.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return
  event.preventDefault()
  if (!busy) send()
})
document.getElementById("new")!.addEventListener("click", () => {
  if (busy) return
  session = undefined
  list.replaceChildren()
  status.textContent = ""
})

async function send() {
  const text = input.value.trim()
  if (!text) return
  const tab = usePage.checked ? page : undefined
  if (tab && !/^https?:/.test(tab.url ?? "")) return show("DeV can only read http and https pages.")
  // Asked before anything else is awaited, while the click still counts as a user gesture. Chrome
  // remembers the answer per site, so each site is asked once.
  const granted = tab
    ? await chrome.permissions.request({ origins: [`${new URL(tab.url!).origin}/*`] }).catch(() => false)
    : true
  if (!granted) return show("DeV wasn't allowed to read this site. Untick “Use this page” to send without it.")
  setBusy(true)
  status.textContent = ""
  const attached = tab ? await readPage(tab).catch(() => undefined) : undefined
  if (tab && !attached) {
    setBusy(false)
    return show("Couldn't read this page.")
  }
  const parts: Part[] = attached ? [{ type: "text", text }, attached] : [{ type: "text", text }]
  input.value = ""
  list.append(bubble({ info: { role: "user" }, parts }))
  session ??= await createSession()
  if (!session) return setBusy(false)
  const poll = setInterval(refresh, 1000)
  const reply = await call("POST", `/session/${session}/message`, { parts })
  clearInterval(poll)
  await refresh()
  if (reply.status !== 200) show(describe(reply))
  setBusy(false)
}

function stop() {
  if (session) call("POST", `/session/${session}/abort`)
}

async function createSession() {
  const reply = await call("POST", "/session", { title: "DeV for Chrome" })
  if (reply.status === 200) return (reply.body as { id: string }).id
  show(describe(reply))
}

async function readPage(tab: chrome.tabs.Tab) {
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => document.body?.innerText ?? "",
  })
  const text = String(frame?.result ?? "").slice(0, PAGE_LIMIT)
  return { type: "text", text: wrap(tab.url!, `Title: ${tab.title ?? ""}\n\n${text}`), synthetic: true }
}

async function refresh() {
  if (!session) return
  const render = ++renders
  const reply = await call("GET", `/session/${session}/message`)
  // A slow poll must not overwrite a newer snapshot.
  if (reply.status !== 200 || render !== renders) return
  list.replaceChildren(...(reply.body as Message[]).map(bubble))
  list.scrollTop = list.scrollHeight
}

function bubble(message: Message) {
  const element = document.createElement("div")
  element.className = `message ${message.info.role}`
  // textContent only: model output and page text never become HTML.
  element.textContent = message.parts
    .filter((part) => part.type === "text" && !part.synthetic)
    .map((part) => part.text)
    .join("\n\n")
  if (message.parts.some((part) => part.synthetic)) element.append(note("Page attached"))
  if (message.info.error)
    element.append(note(message.info.error.data?.message ?? message.info.error.name ?? "Failed", "error"))
  return element
}

function note(text: string, extra = "") {
  const element = document.createElement("span")
  element.className = `note ${extra}`
  element.textContent = text
  return element
}

function call(method: string, path: string, body?: unknown) {
  port ??= connect()
  const id = ++requests
  port.postMessage({ id, method, path, body })
  return new Promise<Reply>((resolve) => pending.set(id, resolve))
}

function connect() {
  const next = chrome.runtime.connectNative("dev.devcode")
  next.onMessage.addListener((message) => {
    const reply = message as Reply
    pending.get(reply.id)?.(reply)
    pending.delete(reply.id)
  })
  next.onDisconnect.addListener(() => {
    // The host only serves sessions it created, so a new host means a new chat.
    port = undefined
    session = undefined
    const error = chrome.runtime.lastError?.message ?? "DeV stopped."
    for (const resolve of pending.values()) resolve({ id: 0, status: 0, body: { error } })
    pending.clear()
  })
  return next
}

function describe(reply: Reply) {
  const error = (reply.body as { error?: unknown } | null)?.error
  const text = typeof error === "string" ? error : JSON.stringify(reply.body)
  if (reply.status === 0 && /not found/i.test(text))
    return `DeV isn't connected. In a terminal run: devcode native-host --install --extension-id ${chrome.runtime.id}`
  return text
}

function show(text: string) {
  status.textContent = text
}

function setBusy(value: boolean) {
  busy = value
  button.textContent = value ? "Stop" : "Send"
}
