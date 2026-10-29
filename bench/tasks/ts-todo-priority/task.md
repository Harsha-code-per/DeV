Add priorities to the todo app in `src/`.

- `src/todo.ts`: add a `priority` field of type `"low" | "normal" | "high"` to `Todo`. `createTodo(title, priority?)` takes an optional priority that defaults to `"normal"`.
- `src/store.ts`: `Store.add` keeps working as before. `Store.list()` returns todos ordered `high`, then `normal`, then `low`, keeping the order they were added within the same priority.
- `src/format.ts`: `formatTodo` prefixes high-priority todos with `! ` (before the checkbox). Other priorities look exactly as they do today.
