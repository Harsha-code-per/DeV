import { expect, test } from "bun:test"
import { orders } from "./src/data"
import { handle } from "./src/handler"
import { createRepo } from "./src/repo"
import { createService } from "./src/service"
import type { Order } from "./src/types"

const repo = createRepo(orders)
const service = createService(repo)
const get = (query: Record<string, string>) => handle(service, { method: "GET", path: "/orders", query })
const ids = (list: Order[]) => list.map((order) => order.id)
type Body = { orders: Order[]; page: number; limit: number; count: number; pages: number }

test("repo.find filters by every given field, keeping repo order", () => {
  expect(ids(repo.find({}))).toEqual(ids(orders))
  expect(ids(repo.find({ statuses: ["paid", "shipped"] }))).toEqual(["o01", "o03", "o05", "o07", "o08", "o09", "o10"])
  expect(ids(repo.find({ customer: "acme", statuses: ["paid"] }))).toEqual(["o01", "o09"])
  expect(ids(repo.find({ minTotal: 4500, maxTotal: 8800 }))).toEqual(["o02", "o05", "o09", "o11", "o12"])
  expect(ids(repo.find({ customer: "ACME" }))).toEqual([])
  expect(ids(repo.find({ maxTotal: 150 }))).toEqual(["o06"])
})

test("service.queryOrders uses repo.find", () => {
  const calls: unknown[] = []
  const spy = { ...repo, find: (filter: Parameters<typeof repo.find>[0]) => (calls.push(filter), repo.find(filter)) }
  const result = createService(spy).queryOrders({ customer: "umbrella" })
  expect(calls.length).toBe(1)
  expect(ids(result.orders)).toEqual(["o11", "o07"])
})

test("service defaults: newest first, page 1, limit 20", () => {
  const result = service.queryOrders({})
  expect(result.page).toBe(1)
  expect(result.limit).toBe(20)
  expect(result.count).toBe(12)
  expect(result.pages).toBe(1)
  expect(ids(result.orders)).toEqual(ids(service.listOrders()))
})

test("service sorts by total with id tie-break in both directions", () => {
  expect(ids(service.queryOrders({ sort: "total", limit: 6 }).orders)).toEqual(["o07", "o10", "o03", "o01", "o12", "o11"])
  expect(ids(service.queryOrders({ sort: "total", order: "asc", limit: 6 }).orders)).toEqual([
    "o06",
    "o04",
    "o08",
    "o02",
    "o05",
    "o09",
  ])
  expect(ids(service.queryOrders({ sort: "total", order: "desc", minTotal: 4500, maxTotal: 4500 }).orders)).toEqual([
    "o02",
    "o05",
    "o09",
  ])
  expect(ids(service.queryOrders({ sort: "createdAt", order: "asc", limit: 3 }).orders)).toEqual(["o01", "o02", "o03"])
})

test("service paginates after filtering and sorting", () => {
  const page2 = service.queryOrders({ sort: "createdAt", order: "asc", page: 2, limit: 5 })
  expect(ids(page2.orders)).toEqual(["o06", "o07", "o08", "o09", "o10"])
  expect(page2).toMatchObject({ page: 2, limit: 5, count: 12, pages: 3 })
  const last = service.queryOrders({ order: "asc", page: 3, limit: 5 })
  expect(ids(last.orders)).toEqual(["o11", "o12"])
  expect(service.queryOrders({ page: 4, limit: 5 }).orders).toEqual([])
  const none = service.queryOrders({ customer: "nobody" })
  expect(none).toMatchObject({ orders: [], count: 0, pages: 0 })
})

test("ties on createdAt are broken by id", () => {
  const same = "2026-01-01T00:00:00Z"
  const custom: Order[] = [
    { id: "b", customer: "x", status: "paid", total: 1, createdAt: same },
    { id: "c", customer: "x", status: "paid", total: 1, createdAt: same },
    { id: "a", customer: "x", status: "paid", total: 1, createdAt: same },
  ]
  const s = createService(createRepo(custom))
  expect(ids(s.queryOrders({}).orders)).toEqual(["a", "b", "c"])
  expect(ids(s.queryOrders({ order: "asc" }).orders)).toEqual(["a", "b", "c"])
})

test("GET /orders parses every parameter", () => {
  const res = get({
    status: "paid,shipped",
    customer: "acme",
    minTotal: "100",
    maxTotal: "50000",
    sort: "total",
    order: "asc",
    page: "1",
    limit: "2",
    ignored: "yes",
  })
  expect(res.status).toBe(200)
  const body = res.body as Body
  expect(ids(body.orders)).toEqual(["o09", "o01"])
  expect(body).toMatchObject({ page: 1, limit: 2, count: 3, pages: 2 })
})

test("GET /orders without parameters uses the defaults", () => {
  const res = get({})
  expect(res.status).toBe(200)
  expect(res.body).toMatchObject({ page: 1, limit: 20, count: 12, pages: 1 })
  expect(handle(service, { method: "GET", path: "/orders" }).status).toBe(200)
})

test("GET /orders single status and page past the end", () => {
  expect(ids((get({ status: "cancelled" }).body as Body).orders)).toEqual(["o12", "o04"])
  const res = get({ page: "9", limit: "100" })
  expect(res.status).toBe(200)
  expect((res.body as Body).orders).toEqual([])
})

test("GET /orders rejects bad parameters with 400", () => {
  const bad: Record<string, string>[] = [
    { status: "refunded" },
    { status: "paid,bogus" },
    { status: "paid," },
    { minTotal: "1.5" },
    { maxTotal: "-1" },
    { minTotal: "" },
    { page: "abc" },
    { page: "0" },
    { limit: "0" },
    { limit: "101" },
    { limit: "2x" },
    { minTotal: "500", maxTotal: "100" },
    { sort: "customer" },
    { order: "up" },
  ]
  for (const query of bad) {
    const res = get(query)
    expect({ query, status: res.status }).toEqual({ query, status: 400 })
    expect(typeof (res.body as { error: unknown }).error).toBe("string")
  }
})

test("GET /orders/:id still works", () => {
  expect(handle(service, { method: "GET", path: "/orders/o07" })).toEqual({ status: 200, body: orders[6] })
  expect(handle(service, { method: "GET", path: "/orders/zzz" }).status).toBe(404)
})
