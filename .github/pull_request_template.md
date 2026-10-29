## What and why

<!-- What this changes and why. Link the issue: Fixes #123 -->

## How I verified it

<!-- Tests you ran, steps a reviewer can repeat, screenshots for UI changes. -->

## Checklist

- [ ] Tests pass for what I changed (`../../scripts/test -- <files>` from the package directory)
- [ ] `bun typecheck` passes in each package I touched (`../../scripts/capped 6G -- bun typecheck`)
- [ ] `bun script/brand-check.ts --check` passes
- [ ] Every commit is signed off (`git commit -s`, see [DCO](https://developercertificate.org))
- [ ] The PR title follows `type(scope): summary`
