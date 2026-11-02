/** "5m check the deploy" → every 5 minutes, "check the deploy". At least 30 seconds apart. */
export function parseLoop(input: string) {
  const match = input.trim().match(/^(?:every\s+)?(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)\b[\s,:]*(.+)$/i)
  if (!match) return
  const unit = match[2]!.toLowerCase()
  const factor = unit.startsWith("h") ? 3_600_000 : unit.startsWith("m") ? 60_000 : 1000
  const every = Math.round(Number(match[1]) * factor)
  if (every < 30_000 || !match[3]!.trim()) return
  return { every, text: match[3]!.trim() }
}

export function describeEvery(ms: number) {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  if (ms % 60_000 === 0) return `${ms / 60_000}m`
  return `${Math.round(ms / 1000)}s`
}
