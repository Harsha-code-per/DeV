export async function retry<T>(fn: () => Promise<T>, attempts: number, delayMs = 0): Promise<T> {
  for (let i = 1; i < attempts; i++) {
    try {
      return fn()
    } catch {
      await Bun.sleep(delayMs)
    }
  }
  throw new Error("retry failed")
}
