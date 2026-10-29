// Matches request paths to route names, e.g. "/users/:id" -> { name: "user", params: { id: "42" } }.
export function createRouter() {
  const routes: { pattern: RegExp; keys: string[]; name: string }[] = []
  return {
    add(pattern: string, name: string) {
      const keys: string[] = []
      const source = pattern.replace(/:(\w+)/g, (_, key) => (keys.push(key), "([^/]+)")).replace(/\*(\w+)/g, (_, key) => (keys.push(key), "(.*)"))
      routes.push({ pattern: new RegExp(`^${source}$`), keys, name })
    },
    match(path: string) {
      for (const route of routes) {
        const m = route.pattern.exec(path)
        if (m) return { name: route.name, params: Object.fromEntries(route.keys.map((key, i) => [key, m[i + 1]])) }
      }
      return undefined
    },
  }
}
