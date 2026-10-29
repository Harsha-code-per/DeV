import { expect, test } from "bun:test"
import { orders } from "../src/data"
import { handle } from "../src/handler"
import { createRepo } from "../src/repo"
import { createService } from "../src/service"

const service = createService(createRepo(orders))

test("listOrders returns every order, newest first", () => {
  const ids = service.listOrders().map((order) => order.id)
  expect(ids).toEqual(["o12", "o11", "o10", "o09", "o08", "o07", "o06", "o05", "o04", "o03", "o02", "o01"])
})

test("GET /orders returns the orders", () => {
  const res = handle(service, { method: "GET", path: "/orders" })
  expect(res.status).toBe(200)
  expect((res.body as { orders: unknown[] }).orders).toHaveLength(12)
})

test("GET /orders/:id", () => {
  expect(handle(service, { method: "GET", path: "/orders/o03" })).toEqual({ status: 200, body: orders[2] })
  expect(handle(service, { method: "GET", path: "/orders/nope" }).status).toBe(404)
})

test("other methods are rejected", () => {
  expect(handle(service, { method: "POST", path: "/orders" }).status).toBe(405)
})
