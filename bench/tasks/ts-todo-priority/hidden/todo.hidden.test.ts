import { expect, test } from "bun:test"
import { formatTodo } from "./src/format"
import { Store } from "./src/store"
import { createTodo } from "./src/todo"

test("priority defaults to normal", () => {
  expect(createTodo("a").priority).toBe("normal")
  expect(createTodo("b", "high").priority).toBe("high")
})

test("list orders by priority and keeps insertion order within one", () => {
  const store = new Store()
  const titles = [
    ["l1", "low"],
    ["n1", "normal"],
    ["h1", "high"],
    ["n2", "normal"],
    ["l2", "low"],
    ["h2", "high"],
  ] as const
  titles.forEach(([title, priority]) => store.add(createTodo(title, priority)))
  expect(store.list().map((t) => t.title)).toEqual(["h1", "h2", "n1", "n2", "l1", "l2"])
})

test("complete still works", () => {
  const store = new Store()
  const todo = store.add(createTodo("x", "low"))
  store.complete(todo.id)
  expect(store.list()[0].done).toBe(true)
})

test("formatTodo marks high priority only", () => {
  expect(formatTodo({ ...createTodo("ship it", "high"), done: true })).toBe("! [x] ship it")
  expect(formatTodo(createTodo("later", "low"))).toBe("[ ] later")
  expect(formatTodo(createTodo("soon"))).toBe("[ ] soon")
})
