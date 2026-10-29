// Orders release versions for the "upgrade available" check and the releases page.
export function compareVersions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Oldest first.
export function sortVersions(versions: string[]): string[] {
  return [...versions].sort(compareVersions)
}
