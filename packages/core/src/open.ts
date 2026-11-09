import open from "open"

export function openUrl(input: string) {
  const url = URL.canParse(input) ? new URL(input) : undefined
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:"))
    return Promise.reject(new Error(`Only http and https links can be opened in the browser: ${input}`))
  return open(url.href)
}

/** Opens a file DeV itself wrote, such as an artifact page, in the default app for it. */
export function openFile(file: string) {
  return open(file)
}
