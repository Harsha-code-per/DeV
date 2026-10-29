import type { Order } from "./types"

export type Repo = ReturnType<typeof createRepo>

export function createRepo(orders: Order[]) {
  return {
    list: () => [...orders],
    get: (id: string) => orders.find((order) => order.id === id),
  }
}
