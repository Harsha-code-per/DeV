import { expect, test } from "bun:test"
import { paginate } from "./src/paginate"

const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

test("first page starts at the first item", () => {
  expect(paginate(items, 1, 3)).toEqual({ items: [0, 1, 2], page: 1, pages: 4 })
})

test("middle page", () => {
  expect(paginate(items, 2, 3).items).toEqual([3, 4, 5])
})

test("last partial page is counted and returned", () => {
  expect(paginate(items, 4, 3)).toEqual({ items: [9], page: 4, pages: 4 })
})

test("exact multiple has no extra page", () => {
  expect(paginate(items, 2, 5)).toEqual({ items: [5, 6, 7, 8, 9], page: 2, pages: 2 })
})

test("page past the end is empty", () => {
  expect(paginate(items, 5, 3).items).toEqual([])
})

test("empty list has zero pages", () => {
  expect(paginate([], 1, 3)).toEqual({ items: [], page: 1, pages: 0 })
})
