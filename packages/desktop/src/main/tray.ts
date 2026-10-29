import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray } from "electron"
import type { WebContents } from "electron"

import { write as writeLog } from "./logging"
import { nativeT } from "./native-translations"
import { getStore } from "./store"
import { QUICK_PROMPT_HOTKEY_KEY, START_AT_LOGIN_KEY } from "./store-keys"
import { autostartEntry, newSessionLink, quickPromptDirectory, quickPromptHotkey, quickPromptPage } from "./tray-config"
import { iconsDir, preloadPath } from "./windows"

// Mirrors GLOBAL_STORAGE in packages/app/src/utils/persist.ts, where the renderer keeps its server state.
const GLOBAL_STORE = "opencode.global.dat"

// Electron gives no way to ask whether a tray will be visible. macOS and Windows always have one;
// on Linux it needs a StatusNotifierItem host (GNOME has none without the AppIndicator extension).
// ponytail: XEmbed-only trays count as unavailable, so those desktops keep quit-on-close.
export function trayAvailable() {
  if (process.platform !== "linux") return Promise.resolve(true)
  return new Promise<boolean>((resolve) =>
    execFile(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.freedesktop.DBus",
        "--object-path",
        "/org/freedesktop/DBus",
        "--method",
        "org.freedesktop.DBus.NameHasOwner",
        "org.kde.StatusNotifierWatcher",
      ],
      { timeout: 2000 },
      (error, stdout) => resolve(!error && stdout.includes("true")),
    ),
  )
}

export function createTray(deps: { available: boolean; appId: string; open: (urls: string[]) => void }) {
  let popup: BrowserWindow | undefined

  const newSession = (prompt?: string) =>
    deps.open([newSessionLink(quickPromptDirectory(getStore(GLOBAL_STORE).get("server"), homedir()), prompt)])

  const openPopup = () => {
    if (popup) return popup.focus()
    popup = createPopup()
  }
  const togglePopup = () => {
    if (popup) return popup.destroy()
    popup = createPopup()
  }

  const createPopup = () => {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const width = Math.min(640, area.width - 32)
    const height = 56
    const win = new BrowserWindow({
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: app.getName(),
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    // Destroyed rather than hidden so an idle app holds no popup renderer.
    win.on("blur", () => win.destroy())
    // A file dropped on the input would otherwise navigate the popup away from the prompt page.
    win.webContents.on("will-navigate", (event) => event.preventDefault())
    win.on("closed", () => {
      if (popup === win) popup = undefined
    })
    win.once("ready-to-show", () => {
      win.show()
      win.focus()
    })
    void win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(quickPromptPage(nativeT("desktop.quickPrompt.placeholder")))}`,
    )
    return win
  }

  const accelerator = quickPromptHotkey(getStore().get(QUICK_PROMPT_HOTKEY_KEY))
  const registered = registerHotkey(accelerator, togglePopup)
  if (!registered) writeLog("main", "quick prompt hotkey not registered", { accelerator }, "warn")
  app.once("will-quit", () => globalShortcut.unregisterAll())

  // Refresh the autostart entry so it follows a moved or updated app.
  if (getStore().get(START_AT_LOGIN_KEY) === true) applyStartAtLogin(deps.appId, true)

  const tray = deps.available ? new Tray(trayIcon()) : undefined
  tray?.setToolTip(app.getName())
  tray?.on("click", () => deps.open([]))

  const refresh = () =>
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: nativeT("desktop.tray.open"), click: () => deps.open([]) },
        {
          label: nativeT("desktop.tray.quickPrompt"),
          accelerator: registered ? accelerator : undefined,
          registerAccelerator: false,
          click: openPopup,
        },
        { label: nativeT("desktop.menu.newSession"), click: () => newSession() },
        { type: "separator" },
        {
          label: nativeT("desktop.tray.startAtLogin"),
          type: "checkbox",
          checked: getStore().get(START_AT_LOGIN_KEY) === true,
          click: (item) => {
            getStore().set(START_AT_LOGIN_KEY, item.checked)
            applyStartAtLogin(deps.appId, item.checked)
          },
        },
        { type: "separator" },
        { label: nativeT("desktop.tray.quit"), click: () => app.quit() },
      ]),
    )
  refresh()

  return {
    available: Boolean(tray),
    refresh,
    submit(sender: WebContents, text: string) {
      if (!popup || popup.webContents !== sender) return
      popup.destroy()
      const prompt = text.trim()
      if (prompt) newSession(prompt)
    },
  }
}

function registerHotkey(accelerator: string, callback: () => void) {
  // register throws on an accelerator it cannot parse, which a hand-edited setting can be.
  try {
    return globalShortcut.register(accelerator, callback)
  } catch (error) {
    writeLog("main", "invalid quick prompt hotkey", { accelerator, error }, "warn")
    return false
  }
}

function trayIcon() {
  if (process.platform === "win32") return nativeImage.createFromPath(join(iconsDir(), "icon.ico"))
  const png = join(iconsDir(), "32x32.png")
  // The menu bar is 16pt tall; the 32px mark as a 2x image stays sharp there.
  if (process.platform === "darwin") return nativeImage.createFromBuffer(readFileSync(png), { scaleFactor: 2 })
  return nativeImage.createFromPath(png)
}

function applyStartAtLogin(appId: string, enabled: boolean) {
  if (process.platform !== "linux") return app.setLoginItemSettings({ openAtLogin: enabled, args: ["--hidden"] })
  const file = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "autostart", `${appId}.desktop`)
  const entry = autostartEntry(app.getName(), [
    process.env.APPIMAGE ?? process.execPath,
    ...(app.isPackaged ? [] : [app.getAppPath()]),
    "--hidden",
  ])
  void (
    enabled ? mkdir(dirname(file), { recursive: true }).then(() => writeFile(file, entry)) : rm(file, { force: true })
  ).catch((error) => writeLog("main", "failed to update autostart entry", { file, error }, "warn"))
}
