export class Cache<K, V> {
  private entries = new Map<K, V>()

  constructor(readonly capacity: number) {}

  get(key: K) {
    return this.entries.get(key)
  }

  set(key: K, value: V) {
    this.entries.set(key, value)
  }

  has(key: K) {
    return this.entries.has(key)
  }
}
