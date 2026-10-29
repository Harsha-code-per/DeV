`mapLimit` in `src/map-limit.ts` is used to fetch thousands of URLs with a bounded number of requests in flight, but callers see results attached to the wrong items and it misbehaves on failures. Fix it, keeping the signature.

Required behaviour:

- It resolves with an array whose element `i` is the result for `items[i]`, whatever order the calls finish in.
- `fn` is called as `fn(item, index)` with the item's 0-based index, once per item, in item order.
- At most `limit` calls are in flight at any time, and a new call starts as soon as one finishes while items remain (it does not wait for a whole batch).
- If a call fails (its promise rejects, or `fn` throws synchronously), the returned promise rejects with that error and no further calls are started, even when calls that were already running finish later.
- An empty `items` resolves to `[]` without calling `fn`.
- `limit` must be a whole number of at least 1; otherwise the returned promise rejects with a `RangeError` and `fn` is never called.
