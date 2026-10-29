// A half-open range: covers start <= x < end.
export type Range = { start: number; end: number }

// Merges overlapping or touching ranges. The result is sorted by start.
export function mergeRanges(ranges: Range[]): Range[] {
  const result: Range[] = []
  for (const range of ranges) {
    if (range.end <= range.start) continue
    let merged = { ...range }
    for (let i = result.length - 1; i >= 0; i--) {
      const other = result[i]
      if (other.start <= merged.end && merged.start <= other.end) {
        merged = { start: Math.min(other.start, merged.start), end: Math.max(other.end, merged.end) }
        result.splice(i, 1)
      }
    }
    let at = 0
    while (at < result.length && result[at].start < merged.start) at++
    result.splice(at, 0, merged)
  }
  return result
}

// The parts of [from, to) not covered by any range, sorted by start.
export function gaps(ranges: Range[], from: number, to: number): Range[] {
  const result: Range[] = []
  let cursor = from
  for (const range of mergeRanges(ranges)) {
    if (range.end <= cursor) continue
    if (range.start >= to) break
    if (range.start > cursor) result.push({ start: cursor, end: range.start })
    cursor = Math.max(cursor, range.end)
  }
  if (cursor < to) result.push({ start: cursor, end: to })
  return result
}
