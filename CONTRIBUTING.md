# Contributing to Mensura

Same rules for a person and for a coding agent. The license is MIT. Opening a pull request counts as offering the change under that license.

## Setup

Node 22+ and pnpm. The repo pins pnpm via `packageManager`; `corepack enable` is enough.

```bash
pnpm install
pnpm run ci
```

`pnpm run ci` is the merge bar: typecheck, build, the full test suite, and `node bin/mensura.mjs run --all --check`.

## Changes

Match the style of the code you touch. New behaviour and bug fixes need a test that fails without the change. Tests live in `tests/**/*.test.ts`. If you change how the engine measures or resolves source, update [docs/engine.md](docs/engine.md) in the same PR. Metric pages live under [docs/metrics/](docs/metrics/README.md).

Do not green the gate by skipping files, deleting assertions, or moving thresholds. A miss is a finding. Fix the code or say why the bar is wrong.

An issue is optional. The pull request can be the spec when the change is obvious. The PR still needs the problem and how to reproduce it, even when there is no issue. A bug issue uses those two fields. Other issues use problem only.

## Pull requests

Open against `main` from a fork. Drafts are welcome. Mark the PR ready when you want review.

The first workflow run from a new fork stays blocked until a maintainer approves it. That is GitHub, not a red test.

If a coding agent drafted the PR, a one-line note in the description is enough. Not required.

## Review

A maintainer reviews on the PR. Expect comments. Push a follow-up commit or reply. We do not silently push onto your branch to finish the design.

## Maintainers

Approve the first workflow run from a new fork so CI can actually run.

Leave review comments. Do not push onto the author's branch for a behaviour change. If they go quiet and a one-line fix is all that remains, say so on the PR before you push.

Merge only a ready PR with green CI. Do not merge drafts.
