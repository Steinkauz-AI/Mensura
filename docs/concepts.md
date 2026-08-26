# Concepts

Deterministic code-quality measurement against a checkout: a metrics engine plus a CLI that presents Snapshots as bounded tables (agents) or an interactive TTY shell (humans).

## Metrics

The engine (`src/core/`, `src/metrics/`, `src/lang/`) — one submodule per metric, a metric registry, and Snapshots under the checkout’s Mensura directory — plus a presentation layer (`src/cli/`, binary `mensura`).

- Bare `mensura` and `--help` print the same help map plus a status rollup; `mensura -i` is the interactive human shell and requires a TTY.
- Every other command prints a bounded table under a pinned agent contract; the Snapshot on disk is the machine document.
- A metric id is required on `run` / `snapshot show` / `snapshot diff`; the snapshot view always includes the catalog threshold; `--check` only changes the exit code to 2 on a miss.
- Function-grain metrics score a function body; structure-grain metrics score a source file on the checkout’s import graph.
- A new Snapshot is written only when none is Current; test coverage and CRAP run the checkout’s `test:coverage` script only when they must measure again.
- Language-specific walk/parse/graph live under `src/lang/<id>/` behind a `LanguageBackend` seam (today: TypeScript/JavaScript only).

**Avoid:** treating the interactive UI as the agent interface; scraping CLI stdout as JSON (import the package); persisting the import graph (it is an intermediate, like the AST).

## Snapshot

A saved metric report for a checkout, kept under that checkout’s Mensura directory. Identity is the scored inputs at save time, not recency and not a git revision. An older Snapshot can still be the one for this checkout. `latest` is the newest file on disk — it is not a synonym for current.

**Avoid:** treating the latest file as the only Snapshot that can match; git SHA as identity of what was measured; redefining latest to mean Current Snapshot.

## Current Snapshot

A Snapshot whose scored inputs match the checkout now. A metric is current when it has a Current Snapshot — measuring it again would duplicate work, including test-coverage preparation. When none exists, that metric needs measuring again. The CLI reports whether existing Snapshots are current; it does not refuse to show a Snapshot that is not. A gate check that had to measure may still persist Snapshots so that work is not thrown away; an explicit no-save does not. There is no force-remeasure: delete the store and run if the hash was wrong.

**Avoid:** failing or blocking a command because a Snapshot is not current; re-running analysis or test-coverage when a Current Snapshot exists; calling only the latest Snapshot current; a force flag that bypasses reuse.

## Status

Per metric, one of: **up-to-date** (a Current Snapshot exists), **outdated** (Snapshots exist but none is current), **missing** (no Snapshot). Existing metrics on a checkout are up-to-date when none of them is outdated. Help shows a rollup; `list` and the interactive shell show every metric. Status is never a gate.

**Avoid:** calling this “Currency” (reads as money); using stale or latest as the name of this state; treating missing as outdated; failing help or list because a metric is outdated; putting the full status table on help.

## Mensura directory

`.mensura/` at the root of a checkout Mensura operates on. Holds local configuration (`config.json` — skip lists, per-metric thresholds and bands) and metric snapshots. The CLI writes catalog defaults into `config.json` when the file is missing.

**Avoid:** treating this directory as a job database or control plane; storing skip lists outside the target checkout’s own config.

## LanguageBackend

The seam for language-specific extraction: file extensions, function-unit walk, and import graph. Implementations live under `src/lang/<id>/`. Metrics consume units/graphs; they do not import the TypeScript compiler API directly except via `src/lang/typescript/`.

**Avoid:** forking the registry per language; hard-coding TypeScript walks inside metric formulas when adding a second language.
