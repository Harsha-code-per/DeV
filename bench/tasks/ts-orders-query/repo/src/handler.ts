import type { Service } from "./service"
import type { Request, Response } from "./types"

export function handle(service: Service, req: Request): Response {
  if (req.method !== "GET") return { status: 405, body: { error: "method not allowed" } }
  if (req.path === "/orders") return { status: 200, body: { orders: service.listOrders() } }
  const match = /^\/orders\/([^/]+)$/.exec(req.path)
  if (!match) return { status: 404, body: { error: "not found" } }
  const order = service.getOrder(match[1])
  if (!order) return { status: 404, body: { error: "order not found" } }
  return { status: 200, body: order }
}
