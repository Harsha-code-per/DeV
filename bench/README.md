# DeV benchmark

Small and medium real coding tasks with hidden tests (30 so far), for measuring DeV Code on real work.

## Tasks

Each folder in `tasks/` has:

- `task.md`: the prompt the agent gets, exactly as written.
- `repo/`: the starting project. It's copied to a fresh git repository under `/var/tmp/dev-bench/` for every run.
- `hidden/`: tests the agent never sees. They're copied in after the agent finishes, overwriting any file with the same name (including tests the agent edited), then run with `bun test` or `python3 -m unittest`.

The first 10 tasks are small (a bug fix, a feature, a refactor, a failing test, parsing, a CLI and a shell script). The 20 harder ones need investigation or several files: a layered service with filtering and pagination, concurrency and event-emitter bugs, DST-correct date bucketing, exact money splitting, Unicode graphemes, cache invalidation, a behaviour-preserving refactor, an expression evaluator, an INI parser from a spec, log-analysis CLIs in Python and Bash, a 200,000-item performance task, SemVer ordering, a safe deep merge, Markdown anchors and a router. All of them run offline and need nothing installed beyond Bun and Python 3.

A task passes only if every hidden test passes. The `none` agent, which does nothing, fails all of them, so the hidden tests can't pass by accident.

## Running

From the repo root, one agent and one task at a time (the machine can't run several at once):

```sh
bun bench/run.ts                                   # DeV Code with auto/free on every task
bun bench/run.ts --tasks ts-paginate,ts-slugify    # selected tasks
bun bench/run.ts --agents devcode --model <provider/model>
bun bench/run.ts --agents none                     # sanity check: everything must fail
bun bench/run.ts --runs 3
```

Options: `--agents` (`devcode`, `none`), `--tasks`, `--model`, `--timeout` (minutes per run, default 10), `--runs`.

Each agent run is memory-capped with `scripts/capped 3G` and killed at the timeout. Results go to `results/<run-id>.json` (pass or fail, seconds, exit code, tokens, cost, the agent's last message and the test output) and a summary table is printed. Result files are not committed.

DeV Code uses whatever `devcode` has stored from `/connect`; set `XDG_DATA_HOME` to run the benchmark from a separate login.

## How each agent is run

| Agent | Command |
|---|---|
| `devcode` | The installed `devcode`: `devcode run --format json --permission-mode auto --model auto/free <task>` |

## Results

| Date | Agent | Build | Models | Passed | Cost | Median time |
|---|---|---|---|---|---|---|
| 2026-11-01 | DeV Code | v0.9.0-rc.5 | `auto/free` with three free providers | 27/30 | $0 | 58s |
| 2026-11-01 | DeV Code | v0.9.0-rc.3 | `auto/free` with one free provider | 24/30 | $0 | 113s |
| 2026-11-01 | DeV Code | compiled binary, 59aeaeb3c | `auto/free` with three free providers | 25/30 | $0 | 40s |

One run of each task. Latest failures: py-access-stats, sh-log-errors, ts-emitter-once.

## Not yet

- Running in CI and blocking regressions (roadmap M1).
- Tasks that start from a prepared git history (`run.ts` has no setup step yet).
