import type { AssistantMessage, Provider } from "@dev-ai/sdk/v2"

export function parse(value: string) {
  const [providerID, ...modelID] = value.split("/")
  return { providerID, modelID: modelID.join("/") }
}

export function index(list: Provider[] | undefined) {
  return new Map((list ?? []).map((item) => [item.id, item] as const))
}

export function get(list: Provider[] | ReadonlyMap<string, Provider> | undefined, providerID: string, modelID: string) {
  const provider =
    list instanceof Map
      ? list.get(providerID)
      : Array.isArray(list)
        ? list.find((item) => item.id === providerID)
        : undefined
  return provider?.models[modelID]
}

export function name(
  list: Provider[] | ReadonlyMap<string, Provider> | undefined,
  providerID: string,
  modelID: string,
) {
  return get(list, providerID, modelID)?.name ?? modelID
}

/** The model behind a reply: for DeV Auto, the free model it routed this reply to. */
export function answered(
  list: Provider[] | ReadonlyMap<string, Provider> | undefined,
  message: Pick<AssistantMessage, "providerID" | "modelID" | "served">,
) {
  if (!message.served) return name(list, message.providerID, message.modelID)
  return `Auto → ${name(list, message.served.providerID, message.served.modelID)}`
}
