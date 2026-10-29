The releases page lists `1.10.0` before `1.9.0`, and the "upgrade available" banner tells people on `2.0.0` to "upgrade" to `2.0.0-rc.1`. `compareVersions` in `src/versions.ts` compares versions as plain strings. Fix it to follow Semantic Versioning 2.0.0 precedence; comparing the dot-separated parts as numbers is not enough.

`compareVersions(a, b)` returns a negative number if `a` is older, a positive number if it is newer, and `0` if they have equal precedence. `sortVersions(list)` returns a new array, oldest first, keeping the input order of versions with equal precedence.

Rules:

- A version is `MAJOR.MINOR.PATCH`, optionally followed by `-<pre-release>` and/or `+<build>`, and may have a leading `v` (`v1.2.3`), which is ignored. MAJOR, MINOR and PATCH are non-negative integers compared numerically.
- A version with a pre-release is older than the same version without one: `1.0.0-rc.1 < 1.0.0`.
- Pre-releases are compared identifier by identifier (split on `.`): identifiers made only of digits are compared numerically, others by ASCII order, and a numeric identifier is always older than a non-numeric one. If all shared identifiers are equal, the one with fewer identifiers is older. So `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`.
- Build metadata (after `+`) is ignored: `1.0.0+build.5` and `1.0.0+build.9` have equal precedence.
- Throw an `Error` for anything that is not a valid version, such as `1.2`, `1.2.x`, `1.2.3-` or `1.2.3+` (empty pre-release or build) or `1.2.3-a..b` (empty identifier).
