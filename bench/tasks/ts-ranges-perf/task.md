`mergeRanges` and `gaps` in `src/ranges.ts` power the calendar's free/busy view. They are correct but far too slow: with a large organisation's 200,000 busy ranges the request times out. Make both fast enough to handle 200,000 ranges in well under a second (aim for O(n log n)), without changing their results.

Behaviour to keep (`test/` has a few existing tests):

- Ranges are half-open (`start <= x < end`). Ranges with `end <= start` are ignored.
- `mergeRanges` merges ranges that overlap or touch (`[1, 3)` and `[3, 5)` become `[1, 5)`) and returns new range objects sorted by start. It must not modify its input array or the objects in it.
- `gaps(ranges, from, to)` returns the parts of `[from, to)` not covered by any range, sorted by start, and `[]` when everything is covered. Ranges may extend outside the window.
