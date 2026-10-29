import type { Todo } from "./todo"

export function formatTodo(todo: Todo) {
  return `[${todo.done ? "x" : " "}] ${todo.title}`
}
