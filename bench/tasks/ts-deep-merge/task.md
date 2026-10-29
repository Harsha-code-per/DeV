`mergeConfig(base, ...overrides)` in `src/merge.ts` layers configuration: built-in defaults, then a config file, then per-request overrides (parsed from user JSON). We found three problems: after one request merges its overrides, every later request sees them too, because the defaults object itself changed; arrays get merged index by index (`["a", "b"]` overridden with `["c"]` gives `["c", "b"]`); and a security review showed that user JSON like `{"__proto__": {"admin": true}}` pollutes `Object.prototype`.

Rewrite it with these rules:

- It returns a new object and never modifies `base`, the overrides, or anything inside them. The result shares no plain objects or arrays with the inputs, so changing the result never changes an input.
- Plain objects (prototype `Object.prototype` or `null`) are merged recursively, key by key; later overrides win.
- Arrays are replaced as a whole by a copy, not merged.
- An override value of `undefined` is ignored (the earlier value stays). An override value of `null` removes the key from the result.
- The keys `__proto__`, `constructor` and `prototype` are skipped at every depth, in `base` too: they never appear as keys of the result, and `Object.prototype` is never modified.
- Any other value (numbers, strings, booleans, `Date`s, class instances, functions) is used as is. When the earlier value and the override are not both plain objects, the override simply replaces the earlier value.
