# DeV benchmark

Small, real coding tasks with hidden tests, for measuring DeV Code against other coding agents on the same work.

## Tasks

Each folder in `tasks/` has:

- `task.md`: the prompt the agent gets, exactly as written.
- `repo/`: the starting project. It's copied to a fresh git repository under `/var/tmp/dev-bench/` for every run.
- `hidden/`: tests the agent never sees. They're copied in after the agent finishes, overwriting any file with the same name (including tests the agent edited), then run with `bun test` or `python3 -m unittest`.

The tasks cover a bug fix, a small feature across files, a refactor that must keep behaviour, fixing a failing test, an off-by-one, parsing, async retry logic, a CLI script and a shell script. All of them run offline and need nothing installed beyond Bun and Python 3.

A task passes only if every hidden test passes. The `none` agent, which does nothing, fails all of them, so the hidden tests can't pass by accident.

## Running

From the repo root, one agent and one task at a time (the machine can't run several at once):

```sh
bun bench/run.ts                                   # DeV Code with auto/free on every task
bun bench/run.ts --tasks ts-paginate,ts-slugify    # selected tasks
bun bench/run.ts --agents devcode --model groq/llama-3.3-70b-versatile
bun bench/run.ts --agents none                     # sanity check: everything must fail
bun bench/run.ts --agents devcode,claude,codex --runs 3
```

Options: `--agents` (`devcode`, `claude`, `codex`, `none`), `--tasks`, `--model`, `--timeout` (minutes per run, default 10), `--runs`.

Each agent run is memory-capped with `scripts/capped 3G` and killed at the timeout. Results go to `results/<run-id>.json` (pass or fail, seconds, exit code, tokens, cost, the agent's last message and the test output) and a summary table is printed. Result files are not committed.

**Running `claude` or `codex` uses your own Claude Code or Codex account and its quota or credit.** DeV Code reads provider keys from the repo's `.env`, only inside its own process.

## How each agent is run

| Agent | Command |
|---|---|
| `devcode` | `dev run --format json --permission-mode auto --model auto/free <task>` |
| `claude` | `claude -p --dangerously-skip-permissions --output-format json <task>` |
| `codex` | `codex exec --json --sandbox workspace-write <task>` (Codex reports tokens, not cost) |

## Not yet

- Running in CI and blocking regressions (roadmap M1).
- More tasks: ~30 is the goal, including larger multi-file features and terminal work.
