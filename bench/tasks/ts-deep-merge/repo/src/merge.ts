type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null

// Layers config objects: later sources win, nested objects are merged.
export function mergeConfig(base: Json, ...overrides: Json[]): Json {
  for (const override of overrides) {
    for (const key in override) {
      const value = override[key]
      if (isObject(value)) base[key] = mergeConfig(isObject(base[key]) ? base[key] : {}, value)
      else base[key] = value
    }
  }
  return base
}
