// The slice of the extension API DeV for Chrome uses (instead of depending on @types/chrome).
declare namespace chrome {
  type Listener<T extends unknown[]> = { addListener(callback: (...args: T) => void): void }

  namespace runtime {
    type Port = {
      postMessage(message: unknown): void
      onMessage: Listener<[message: unknown]>
      onDisconnect: Listener<[]>
    }
    const id: string
    const lastError: { message?: string } | undefined
    function connectNative(application: string): Port
  }

  namespace tabs {
    type Tab = { id?: number; url?: string; title?: string }
    function query(query: { active: boolean; currentWindow: boolean }): Promise<Tab[]>
    const onActivated: Listener<unknown[]>
    const onUpdated: Listener<unknown[]>
  }

  namespace permissions {
    function request(permissions: { origins: string[] }): Promise<boolean>
  }

  namespace scripting {
    function executeScript<T>(injection: { target: { tabId: number }; func: () => T }): Promise<{ result?: T }[]>
  }

  namespace sidePanel {
    function setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void>
  }
}
