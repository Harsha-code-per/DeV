Write a command-line script `stats.py` (Python 3 standard library only) that summarises HTTP access logs as JSON.

Usage: `python3 stats.py [--since TIMESTAMP] [--top N] [FILE ...]`

Each log line is `<timestamp> <method> <path> <status> <duration>`, separated by single spaces, for example `2026-10-01T12:00:00Z GET /api/users?page=2 200 80ms`. The timestamp is ISO 8601 with a UTC offset (`Z` or `+hh:mm`), the status is a number from 100 to 599, and the duration is a whole number of milliseconds followed by `ms`. Read every file given, in order; `-` or no files at all means standard input. Blank lines are ignored. Any other line that doesn't match this format exactly is malformed.

Print one JSON object to stdout:

- `requests`: number of valid lines counted.
- `malformed`: number of malformed lines (counted whether or not `--since` is given).
- `status`: an object with keys `"2xx"`, `"3xx"`, `"4xx"`, `"5xx"` (always all four; `1xx` lines count in `requests` but in none of these) and their line counts.
- `endpoints`: the top `N` endpoints (default 5) by request count, highest first, ties ordered by endpoint name. An endpoint is `"<METHOD> <path>"` with any query string (`?` and after) removed from the path. Each entry is `{"endpoint", "count", "p50", "p95", "errors"}`, where `errors` is the number of 5xx responses and `p50` / `p95` are nearest-rank percentiles of the durations in ms: sort the durations and take the `ceil(p/100 * count)`-th smallest (1-based).

`--since TIMESTAMP` (ISO 8601 with offset) keeps only lines whose timestamp is at or after that moment; compare actual moments, not strings, because lines and the option can use different offsets. `--top` must be a positive whole number.

If a file can't be read, print an error to stderr and exit with status 1 (print nothing to stdout). Invalid options (a bad `--top` or `--since` value) exit with status 2, as `argparse` does. `access.log` is a sample.
