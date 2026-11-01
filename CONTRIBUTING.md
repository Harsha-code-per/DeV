# Contributing to DeV

Thanks for helping. Bug fixes, docs, new providers, fixes for platform quirks and missing behaviour are the easiest changes to merge. For a new feature or a UI change, open an issue first so we can agree on the approach. The plan lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## Setup

You need [Bun](https://bun.sh) 1.3 or newer and git.

```sh
git clone https://github.com/Harsha-code-per/DeV.git && cd DeV
bun install
bun dev            # runs DeV Code from source (TUI) in packages/devcode
bun dev <dir>      # runs it in another directory
bun dev --help     # every command, same as `devcode --help`
```

The main package is `packages/devcode`. Others: `packages/core` (shared engine pieces), `packages/tui`, `packages/app` (web UI), `packages/desktop` (Electron app), `packages/plugin` (`@dev-ai/plugin`).

## Tests and typecheck, safely

Builds, typechecks and tests can use a lot of memory. Run them through the two wrappers in `scripts/`:

- `scripts/capped [MAX] -- <cmd>` runs a command under a memory cap (default 4G), so it is killed instead of freezing your machine.
- `scripts/test [MAX] -- <bun test args>` runs bun tests under that cap, with temp files on disk instead of the RAM-backed `/tmp`, and removes them afterwards.

Always run tests **from a package directory, never from the repo root** (the root `test` script refuses on purpose):

```sh
cd packages/devcode
../../scripts/test -- test/tool/edit.test.ts       # only the tests you touched
../../scripts/capped 6G -- bun typecheck           # never call tsc directly
```

Run one heavy job at a time.

## Before you open a PR

- Tests for what you changed pass, and `bun typecheck` passes in each package you touched.
- The brand check passes: `bun script/brand-check.ts --check` from the repo root. It fails when user-visible text says "DeV" instead of DeV; run it without `--check` to fix it in place.
- You followed the [style guide](AGENTS.md).
- If you changed the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`.

## Branches, commits and PR titles

- Branch names: at most three words, joined with hyphens, no slashes or prefixes. Examples: `session-recovery`, `fix-scroll-state`.
- Commits and PR titles use conventional commits: `type(scope): summary`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. The scope is optional, e.g. `devcode`, `core`, `tui`, `app`, `desktop`, `sdk`, `plugin`. Example: `fix(tui): simplify thinking toggle styling`.
- Keep PRs small and focused. Say what changed, why, and how you verified it. For UI changes, add a screenshot.

## Sign your commits (DCO)

Every commit must carry a `Signed-off-by` line, which certifies the [Developer Certificate of Origin](https://developercertificate.org): you wrote the change, or have the right to submit it under the project's MIT license.

```sh
git commit -s -m "fix(devcode): handle empty config"
```

Forgot? `git commit --amend -s` fixes the last commit; `git rebase --signoff main` fixes a branch.

## Security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Code of conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
