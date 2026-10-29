import { expect, test } from "bun:test"
import { cartTotal } from "./src/cart"
import { invoiceLines } from "./src/invoice"
import { lineTotal } from "./src/pricing"

const items = [
  { name: "pen", price: 1.99, qty: 3 },
  { name: "notebook", price: 4.5, qty: 2, discount: 0.1 },
  { name: "stapler", price: 12.345, qty: 1, discount: 0.333 },
  { name: "free sample", price: 0, qty: 5 },
]

test("lineTotal rounds each line to cents", () => {
  expect(items.map(lineTotal)).toEqual([5.97, 8.1, 8.23, 0])
})

test("cartTotal is unchanged", () => {
  expect(cartTotal(items)).toBeCloseTo(22.3, 10)
  expect(cartTotal([])).toBe(0)
})

test("invoiceLines is unchanged", () => {
  expect(invoiceLines(items)).toEqual([
    "pen            3 x 1.99 = 5.97",
    "notebook       2 x 4.50 = 8.10",
    "stapler        1 x 12.35 = 8.23",
    "free sample    5 x 0.00 = 0.00",
  ])
})

test("cart and invoice both use lineTotal", async () => {
  for (const file of ["./src/cart.ts", "./src/invoice.ts"]) {
    const source = await Bun.file(file).text()
    expect(source).toContain("lineTotal")
    expect(source).not.toContain("Math.round")
  }
})
