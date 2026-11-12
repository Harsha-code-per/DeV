# DeV benchmark

Small and medium real coding tasks with hidden tests (30 so far), for measuring DeV Code on real work, and learning tasks (2 so far) that measure whether DeV does better the second time it works in a project.

## Tasks

Each folder in `tasks/` has:

- `task.md`: the prompt the agent gets, exactly as written.
- `repo/`: the starting project. It's copied to a fresh git repository under `/var/tmp/dev-bench/` for every run.
- `hidden/`: tests the agent never sees. After the agent finishes, its folder is copied, the hidden tests are copied over the copy (replacing any file with the same name, including tests the agent edited), and they run there with `bun test` or `python3 -m unittest`.
- `setup.sh` (optional): runs in the new repository before the first commit, for tasks that need a prepared history or generated files.

The first 10 tasks are small (a bug fix, a feature, a refactor, a failing test, parsing, a CLI and a shell script). The 20 harder ones need investigation or several files: a layered service with filtering and pagination, concurrency and event-emitter bugs, DST-correct date bucketing, exact money splitting, Unicode graphemes, cache invalidation, a behaviour-preserving refactor, an expression evaluator, an INI parser from a spec, log-analysis CLIs in Python and Bash, a 200,000-item performance task, SemVer ordering, a safe deep merge, Markdown anchors and a router. All of them run offline and need nothing installed beyond Bun and Python 3.

### Learning tasks

A task whose folder also has `followup.md` is run three times:

1. **first**: `task.md` as usual. The task is written so that the project teaches something on the way, such as a rule the person states once or the way its tests are run.
2. **warm**: the files in `solution/` are copied over the agent's folder, so the code is the reference answer to the first task, and the agent gets `followup.md` there. It is scored with `hidden-followup/`, which checks that the follow-up was done the way the first task taught.
3. **cold**: the same follow-up on the same code in a fresh folder, where the agent has never worked.

Warm and cold start from identical code. The only difference is what the agent kept from its first run, so warm beating cold (more passes, or fewer tokens) is learning, and nothing else is.

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

The score line (`devcode: 28/30 passed`) counts the plain tasks only. Learning tasks are reported on their own line, as warm and cold passes with the median tokens of each.

Each agent run is memory-capped with `scripts/capped 3G` and killed at the timeout. `BENCH_NO_CAP=1` runs without the cap, for machines with no systemd user session. Results go to `results/<run-id>.json` (pass or fail, seconds, exit code, tokens, cost, the agent's last message and the test output) and a summary table is printed. Result files are not committed.

DeV Code uses whatever `devcode` has stored from `/connect`; set `XDG_DATA_HOME` to run the benchmark from a separate login.

## Every week

`.github/workflows/bench.yml` installs the released DeV Code and runs every task on free models, every Monday and whenever it is started by hand before a release. A full run uses about 7 million tokens of free quota, so it is not nightly. `baseline.json` holds the expected score (`passed`) and how far below it one run may fall (`allow`); a run below that goes red, and the release workflow refuses to release while the last run is red. One run varies by several tasks (see the results), which is why `allow` is 3. The workflow needs at least one free provider key as a repository secret: `BENCH_NVIDIA_API_KEY`, `BENCH_GROQ_API_KEY`, `BENCH_CEREBRAS_API_KEY`, `BENCH_GOOGLE_API_KEY` or `BENCH_OPENROUTER_API_KEY`.

## What DeV sends before the task

```sh
bun bench/probe.ts "$(command -v devcode)" /var/tmp/dev-probe
```

Runs `devcode run "hi"` in an empty profile against a local stand-in for a model and prints the size of the request by part: each section of the system prompt and each tool. Every turn of every task pays this again, so it is the first place to look when tokens per solved task are high.

## How each agent is run

| Agent | Command |
|---|---|
| `devcode` | The installed `devcode`: `devcode run --format json --permission-mode auto --model auto/free <task>` |

## Results

| Date | Agent | Build | Models | Passed | Cost | Median time |
|---|---|---|---|---|---|---|
| 2026-11-12 | DeV Code | 1.0.28 build (main, 4de38f502) | `auto/free` with five free providers, three runs | 26/30, 27/30, 28/30 | $0 | 58s |
| 2026-11-10 | DeV Code | v1.0.27 | `auto/free` with five free providers, three runs | 25/30, 30/30, 29/30 | $0 | 58s |
| 2026-11-01 | DeV Code | v0.9.0-rc.5 | `auto/free` with three free providers | 27/30 | $0 | 58s |
| 2026-11-01 | DeV Code | v0.9.0-rc.3 | `auto/free` with one free provider | 24/30 | $0 | 113s |
| 2026-11-01 | DeV Code | compiled binary, 59aeaeb3c | `auto/free` with three free providers | 25/30 | $0 | 40s |

One run of each task before 2026-11-10.

### 2026-11-10, v1.0.27, in detail

90 runs in a new user's empty profile: 84 passed (93%). The spread between runs (25 to 30) is larger than most changes we would want to measure, so compare medians of three runs, not single runs.

- **Failures:** sh-log-errors twice (sorting names that contain a space), and once each py-spec-ini, ts-router-match, ts-emitter-once and ts-markdown-toc.
- **Thinking until the reply ran out:** py-spec-ini and ts-router-match failed without one line of code written. The model spent its whole reply allowance (8,192 tokens) thinking, three times in a row, about 70 seconds each. Eight of the 90 runs were cut off this way at least once; six recovered.
  Fixed after 1.0.27: the router now doubles a model's allowance when a reply stops at it, and remembers that for the model. On these two tasks, three runs each: 4 of 6 before, 6 of 6 after.
- **Tokens:** a median of 235,000 per solved task, in about ten turns. A turn starts at about 20,400 tokens before the task is read: 12,500 for the descriptions of 25 tools and 6,900 for the system prompt.
- **Tools:** 1,082 calls, 8 failed (0.7%). 137 edits, 1 failed. Editing is not what these tasks fail on.
- **Models:** one free model answered 739 of 908 turns; the router changed model inside a task in a few runs.

### 2026-11-10, learning tasks

Three runs of each, `auto/free`. Builds from `main`, each changing one thing:

| Build | learn-rule warm | learn-rule cold | learn-commands warm | learn-commands cold |
|---|---|---|---|---|
| Saved notes in the system prompt (as in 1.0.27) | 0/3 | 0/3 | 1/1 | 1/1 |
| Saved notes shown next to the newest message | 3/3 | 0/3 | | |
| Plus: the model asked to save one note per stated rule | 2/3 | 0/3 | 3/3 | 3/3 |
| Plus: the harness saves the person's rule sentence itself | 3/3 | 0/3 | 3/3 | 3/3 |

- **learn-rule** measures learning: a fresh folder never passes, and the follow-up passes only when the rule was saved and is shown where the model reads it. Free models ignored a saved rule in the system prompt, and when asked to save it they saved the task, a line of their own instructions, or nothing. In the last build the saved note was the person's sentence in all three runs, and nothing else.
- **learn-commands** passes cold as well, so it does not yet measure learning; a project whose checks are harder to find would.

### 2026-11-12, the 1.0.28 build, in detail

81/90 passed. All three runs of py-access-stats failed on one line: the task said "blank lines are ignored" and the model counted a line of only spaces as malformed, a fair reading of an unclear sentence. The task now says what it meant; without that line the score is 84/90, the same as 1.0.27. The other failures are the tasks that failed in 1.0.27 (sh-log-errors twice, ts-emitter-once, ts-markdown-toc, ts-router-match) and ts-deep-merge once.

- **Tokens:** a median of 215,000 per solved task, down from 235,000, after each turn started 4,300 tokens lighter.
- **Learning:** warm 6/6, cold 3/6; learn-rule warm 3/3, cold 0/3.
- **Model:** one free model answered 1,092 of 1,098 turns.

## Not yet

- Harder tasks taken from real repositories; all 30 are small enough that a free model passes most of them.
- More than two learning tasks, and a learn-commands that a fresh folder fails.
