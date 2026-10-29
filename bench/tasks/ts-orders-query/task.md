`GET /orders` in this small order API (`src/handler.ts` → `src/service.ts` → `src/repo.ts`) returns every order at once. Add filtering, sorting and pagination through all three layers.

**Repo.** Add `find(filter)` to the object returned by `createRepo`. `filter` is `{ statuses?: Status[]; customer?: string; minTotal?: number; maxTotal?: number }`. Every field that is given must match: the order's status is one of `statuses`, `customer` matches exactly, and `minTotal` / `maxTotal` are inclusive bounds on `total`. It returns the matching orders in the repo's original order.

**Service.** Add `queryOrders(query)` to the object returned by `createService`. `query` is the repo filter plus `sort?: "createdAt" | "total"` (default `"createdAt"`), `order?: "asc" | "desc"` (default `"desc"`), `page?: number` (default 1, pages start at 1) and `limit?: number` (default 20). It must use `repo.find`, then sort and page the result, and return `{ orders, page, limit, count, pages }`, where `count` is the number of matching orders before paging and `pages` is `Math.ceil(count / limit)`. Orders with equal sort values are ordered by `id` ascending, whatever the `order`. A page past the end has no orders. Keep `listOrders` and `getOrder` as they are.

**Handler.** `GET /orders` reads these query-string parameters from `req.query` and responds `200` with the `queryOrders` result as the body:

- `status`: comma-separated statuses, e.g. `paid,shipped`
- `customer`
- `minTotal`, `maxTotal`
- `sort`, `order`
- `page`, `limit`

Respond `400` with body `{ error: <message> }` when a status is not one of `pending`, `paid`, `shipped`, `cancelled`; when `minTotal`, `maxTotal`, `page` or `limit` is not a whole number written with digits only (`"10"` is fine; `"1.5"`, `"-1"`, `""` and `"abc"` are not); when `page` is 0; when `limit` is 0 or above 100; when `minTotal` is greater than `maxTotal`; or when `sort` or `order` is not one of the values above. Unknown parameters are ignored. `GET /orders/:id` keeps working.

The existing tests in `test/` must keep passing.
