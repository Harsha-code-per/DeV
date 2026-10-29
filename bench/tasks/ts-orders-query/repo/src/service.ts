import type { Repo } from "./repo"
import type { Order } from "./types"

export type Service = ReturnType<typeof createService>

export function createService(repo: Repo) {
  return {
    // Newest first.
    listOrders: () => repo.list().sort(newestFirst),
    getOrder: (id: string) => repo.get(id),
  }
}

function newestFirst(a: Order, b: Order) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? -1 : 1
}
