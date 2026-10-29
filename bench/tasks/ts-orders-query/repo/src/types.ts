export type Status = "pending" | "paid" | "shipped" | "cancelled"

export type Order = {
  id: string
  customer: string
  status: Status
  // Cents.
  total: number
  createdAt: string
}

export type Request = { method: string; path: string; query?: Record<string, string> }
export type Response = { status: number; body: unknown }
