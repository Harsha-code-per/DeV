// Builds the table of contents shown at the top of rendered docs pages.
export function toc(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("#"))
    .map((line) => {
      const level = line.match(/^#+/)![0].length
      const text = line.slice(level).trim()
      const slug = text.toLowerCase().replace(/ /g, "-")
      return `${"  ".repeat(level - 1)}- [${text}](#${slug})`
    })
    .join("\n")
}
