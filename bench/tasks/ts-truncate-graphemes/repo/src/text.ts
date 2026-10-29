// Shortens text to at most `max` characters, ending with "…" when it was cut.
export function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "…"
}

// Up to two initials from a name, e.g. "ada lovelace" -> "AL".
export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("")
}
