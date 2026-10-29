export function createCache<V>(ttlMs: number, now: () => number) {
  const entries = new Map<string, { value: V; expires: number }>()
  return {
    get(key: string) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expires < now()) {
        entries.delete(key)
        return undefined
      }
      entry.expires = now() + ttlMs
      return entry.value
    },
    set(key: string, value: V) {
      entries.set(key, { value, expires: now() + ttlMs })
    },
    delete(key: string) {
      entries.delete(key)
    },
  }
}
