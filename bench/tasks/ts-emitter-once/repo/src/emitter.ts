type Listener = (...args: unknown[]) => void

export class Emitter {
  private listeners = new Map<string, Listener[]>()

  // Returns a function that removes the listener again.
  on(event: string, fn: Listener) {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
    return () => this.off(event, fn)
  }

  once(event: string, fn: Listener) {
    const wrapper: Listener = (...args) => {
      this.off(event, wrapper)
      fn(...args)
    }
    return this.on(event, wrapper)
  }

  off(event: string, fn: Listener) {
    const list = this.listeners.get(event) ?? []
    const index = list.indexOf(fn)
    if (index >= 0) list.splice(index, 1)
  }

  // Returns true if any listener was called.
  emit(event: string, ...args: unknown[]) {
    const list = this.listeners.get(event) ?? []
    for (let i = 0; i < list.length; i++) list[i](...args)
    return list.length > 0
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.length ?? 0
  }
}
