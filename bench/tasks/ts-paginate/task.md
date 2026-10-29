Users report that `paginate` in `src/paginate.ts` is broken: asking for page 1 skips the first items, and the last partial page is never counted in `pages`.

Fix `paginate`. Pages are numbered from 1. `pages` is the total number of pages needed to show every item (0 for an empty list). A page past the end returns no items. Keep the function signature and return shape.
