export type Todo = { id: number; title: string; done: boolean }

let next = 1

export function createTodo(title: string): Todo {
  return { id: next++, title, done: false }
}
