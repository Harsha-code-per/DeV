The admin panel reads users through the caching service in `src/users.ts` (cache in `src/cache.ts`, database stand-in in `src/db.ts`). Support tickets say it shows stale or wrong users: after renaming someone the user list still shows the old name, some filtered lists show the wrong people, entries that are read often never refresh, and one screen that edits the returned objects in place corrupts what other screens see.

Fix the caching so that all of this holds (keep the exported signatures; don't change `src/db.ts`):

- `getUser(id)` and `listUsers(filter)` results are cached. A repeated call with the same arguments within the TTL must not read the database again (tests count `db.calls`).
- A cached value stored at time `t` may be served while `now() < t + ttlMs`; from `t + ttlMs` on, the database is read again. Reading an entry does not extend its lifetime.
- After `updateUser` or `deleteUser`, every later `getUser` and `listUsers` call, for any filter, reflects the change.
- Calls with different arguments never share a cache entry. `listUsers({ role: "dev" })`, `listUsers({ team: "dev" })` and `listUsers({ role: "dev", team: undefined })` are different queries except that a field set to `undefined` means the same as leaving it out.
- Callers get their own copies: mutating a returned user or list must not change what any later call returns.
