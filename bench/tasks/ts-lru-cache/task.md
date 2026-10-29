`Cache` in `src/cache.ts` takes a `capacity` but never uses it, so it grows without bound.

Turn it into an LRU cache:
- when `set()` adds a new key and the cache is full, evict the least recently used entry first
- `get()` of an existing key and `set()` of an existing key both count as a use (and `set()` updates the value)
- `has()` does not count as a use
- add a read-only `size` getter with the number of entries
- the constructor throws a `RangeError` if `capacity` is less than 1
