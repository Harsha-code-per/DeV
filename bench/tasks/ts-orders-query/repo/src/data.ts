import type { Order } from "./types"

export const orders: Order[] = [
  { id: "o01", customer: "acme", status: "paid", total: 12000, createdAt: "2026-09-01T10:00:00Z" },
  { id: "o02", customer: "globex", status: "pending", total: 4500, createdAt: "2026-09-02T09:30:00Z" },
  { id: "o03", customer: "acme", status: "shipped", total: 30000, createdAt: "2026-09-03T15:00:00Z" },
  { id: "o04", customer: "initech", status: "cancelled", total: 999, createdAt: "2026-09-04T08:00:00Z" },
  { id: "o05", customer: "globex", status: "paid", total: 4500, createdAt: "2026-09-05T12:00:00Z" },
  { id: "o06", customer: "acme", status: "pending", total: 150, createdAt: "2026-09-06T18:45:00Z" },
  { id: "o07", customer: "umbrella", status: "shipped", total: 78000, createdAt: "2026-09-07T11:11:00Z" },
  { id: "o08", customer: "initech", status: "paid", total: 2300, createdAt: "2026-09-08T07:20:00Z" },
  { id: "o09", customer: "acme", status: "paid", total: 4500, createdAt: "2026-09-09T13:00:00Z" },
  { id: "o10", customer: "globex", status: "shipped", total: 64000, createdAt: "2026-09-10T16:30:00Z" },
  { id: "o11", customer: "umbrella", status: "pending", total: 5100, createdAt: "2026-09-11T10:05:00Z" },
  { id: "o12", customer: "acme", status: "cancelled", total: 8800, createdAt: "2026-09-12T19:00:00Z" },
]
