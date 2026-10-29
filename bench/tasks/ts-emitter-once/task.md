The app's event bus, `Emitter` in `src/emitter.ts`, drops events: sometimes a listener simply isn't called, `off` doesn't remove listeners added with `once`, and one failing listener stops the rest. Find and fix the bugs, keeping the public methods and their signatures.

Required behaviour:

- `emit(event, ...args)` calls the listeners in the order they were registered, with `args`. It calls exactly the listeners registered when the emit started, minus any that get removed (by `off`, by an unsubscribe function, or because they were `once` listeners that already ran) before their turn comes. Listeners added during an emit are first called on the next emit.
- `emit` returns `true` if it called at least one listener, otherwise `false`.
- If listeners throw, the remaining listeners are still called, and after all of them `emit` throws the first error that was thrown.
- `once(event, fn)` registers `fn` to be called at most once, even if the event is emitted again from inside a listener. `off(event, fn)` with the same `fn` removes it before it runs.
- `on` and `once` return a function that removes that registration; calling it more than once does nothing more.
- The same function may be registered more than once and is then called once per registration; `off(event, fn)` removes one registration of it (the earliest).
- `listenerCount(event)` is the number of current registrations.
