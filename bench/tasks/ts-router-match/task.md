`createRouter()` in `src/router.ts` maps request paths to route names. It tries routes in the order they were added, so `/users/me` is caught by `/users/:id` when that was added first, and it has no handling for encoded characters, trailing slashes or query strings. Rewrite it, keeping `add(pattern, name)` and `match(path)` (which returns `{ name, params }` or `undefined`).

Patterns are split into segments on `/`. Each segment is one of:

- static text, matching that exact segment (case-sensitive);
- `:name`, matching any one non-empty segment and capturing it as `params.name`;
- `*name`, allowed only as the last segment, matching one or more remaining segments and capturing them joined with `/` as `params.name`.

Matching rules:

- Precedence does not depend on the order routes were added. At each segment, a static segment is preferred over a `:param`, which is preferred over a `*wildcard`. If the preferred choice cannot lead to a full match further along, the next choice is tried (so with `/users/me/settings` and `/users/:id/posts`, the path `/users/me/posts` matches the second route with `id` = `me`).
- Anything from `?` on is ignored. A single trailing `/` is ignored (`/users/` is `/users`), and `/` matches the pattern `/`.
- Each captured segment is decoded with `decodeURIComponent` (so `%2F` inside a segment becomes `/` without splitting it). Static segments are compared against the decoded path segment too. A path with an invalid percent-encoding (e.g. `%E0%A4%A`) matches nothing.
- `add` throws an `Error` when a pattern with the same shape was already added (same segments, ignoring parameter names: `/a/:id` and `/a/:key` are the same shape), or when `*` is not the last segment.
