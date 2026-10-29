import type { Todo } from "./todo"

export class Store {
  private todos: Todo[] = []

  add(todo: Todo) {
    this.todos.push(todo)
    return todo
  }

  complete(id: number) {
    const todo = this.todos.find((t) => t.id === id)
    if (todo) todo.done = true
  }

  list() {
    return this.todos
  }
}
