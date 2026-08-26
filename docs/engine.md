# Metrics engine

`src/core/` plus `src/metrics/` and `src/lang/` form the pure engine — no TTY, no stdout. `src/cli/` (`mensura`) is the presentation layer; see [cli.md](cli.md). Snapshots live under the checkout’s `.mensura/` directory.

## Registry

`src/core/registry.ts`. A metric is one submodule folder under `src/metrics/` plus one entry: `id`, `name`, `direction`, `grain` (`function` or `structure`), `analyze`, `diff`, optional `prepare`. Consumers discover metrics through this map and never hard-code ids. Test coverage and CRAP set `prepare` to refresh Istanbul maps via the checkout’s `test:coverage` script.

## Language backends

`src/lang/types.ts` defines `LanguageBackend`. TypeScript/JavaScript lives in `src/lang/typescript/` (checkout walk, unit extraction, import graph, AST scoring helpers). Other languages are skipped today; a second language adds `src/lang/<id>/` behind the same seam.

## Checkout walk

TypeScript and JavaScript, parsed with the compiler API (syntax only; the target need not typecheck or have `node_modules`). Other languages are skipped. Built-in skip directories: `node_modules`, `dist`, `coverage`, `.git`, `build`, `.next`, `out`, `vendor`, `.mensura`. Extra names come from the checkout’s `.mensura/config.json` (`skipDirectories`, matched by directory **basename** anywhere in the tree). `.d.ts` files are omitted; symlinked directories are not followed. Overload signatures (no body) are skipped when extracting function units.

### Path-scoped skips (`skipPaths`)

`skipDirectories` cannot express “this in-repo tree is vendored upstream code” without colliding with same-named directories elsewhere (`alpha` would skip every `components/alpha`). `skipPaths` excludes by location instead:

```json
{
  "skipDirectories": ["_generated"],
  "skipPaths": [
    "packages/alpha",
    { "path": "packages/beta", "grains": ["function"] }
  ]
}
```

- **Match semantics:** patterns are relative POSIX paths from the checkout root. Backslashes and a leading `./` are normalized away, so Windows checkouts compare identically; matching is case-sensitive. A pattern matches that path itself plus every descendant — a segment-boundary prefix, so `packages/alpha` does **not** match `packages/alpha-x`. A trailing `/` or `/**` is accepted and ignored; other globs are rejected with a config error.
- **Grains:** a string entry, or an object without `grains`, applies to every metric. `"grains": ["function"]` / `["structure"]` scope the rule; the registry’s per-metric `grain` field is the vocabulary. Multiple rules may cover the same path — exclusion is the union.
- **Function grain:** skipped files produce no units at all — they are absent from counts, means, bands, coverage percent, and CRAP rather than scoring 0%.
- **Structure grain:** skipped files become no import-graph nodes, so edges into them stop resolving and encapsulation leaks about consumers of that tree vanish. Scope such rules to `"function"` when those findings must survive.
- **Status / input hash:** all-grains rules also leave their files out of the scored-input hash; grain-scoped rules keep their files hashed (any config edit still invalidates every snapshot either way).
- **Downgrades:** older CLIs ignore unknown config keys, so a downgrade silently stops honoring `skipPaths` or `metrics` overrides.

### Thresholds and bands (`metrics`)

Per-metric check bars and display bands live under `metrics` in the same file. CLI usage writes catalog defaults into `.mensura/config.json` when the file is missing (`mensura completion` does not). Missing keys keep those defaults.

```json
{
  "metrics": {
    "cyclomatic-complexity": {
      "threshold": 20,
      "bands": {
        "cuts": [11, 21, 51],
        "labels": ["1-10", "11-20", "21-50", "51+"]
      }
    },
    "test-coverage": {
      "threshold": 50,
      "bands": [80, 50, 20]
    }
  }
}
```

- **threshold:** the `--check` bar (`max` when higher is worse, `min` when higher is better).
- **bands:** three cut numbers, or `{ cuts, labels? }`. Omitted labels are derived from the cuts. Higher-worse cuts must ascend; higher-better cuts must descend.

Function-grain metrics emit function units plus per-file rollups (count, min, max, sum). Structure-grain metrics emit one unit per production source file (`kind: "file"`). Files the parser cannot fully parse are still measured as far as parsed and listed under `unparsed`.

## Import graph

Structure metrics share an in-memory directed graph: source files as nodes, static import/export/`require`/`import()` specifiers as edges. Relative specifiers resolve with TypeScript’s `.js` → `.ts` extension rewrite and `index` files. Bare specifiers resolve only when they name a `package.json` `name` found in the checkout (workspace packages); `node_modules` is never followed. `import type` is still an edge (structural coupling). Test files (`*.test.*` / `*.spec.*` on basename, or any path under a `tests` / `__tests__` directory) are omitted. The graph is an intermediate, like the AST — it is not persisted. JSON snapshots under `.mensura/metrics/<id>/` remain the store; there is no graph database.

## Input hash

Scored inputs are walked source files, root `package.json`, and `.mensura/config.json`. All-grains `skipPaths` leave files out of the hash; grain-scoped rules keep them hashed (raw config text is hashed either way).

## Snapshots

Compact JSON under `<checkout>/.mensura/metrics/<metric>/` with a per-metric `manifest.json` (`latest` / `previous` / file name / timestamp). Retention: 20 newest. Atomic writes. `evaluateMetric` reuses any Snapshot whose scored-input hash matches (a Current Snapshot), not only latest. `latest` remains newest-on-disk. `checkoutStatus` reports per-metric status (`up-to-date` / `outdated` / `missing`).

### Coverage piggyback

When coverage prepare must run and save is on, other coverage-backed metrics that are not current are measured and saved too. A sibling failure must not hide success of the requested metric. `evaluateAllMetrics` runs `test:coverage` at most once: today every `metric.prepare` hook is a coverage refresh, so that path calls `ensureTestCoverage` directly and sets `skipPrepare` rather than running each hook. A future non-coverage `prepare` must not be skipped here.

## Metric catalog

Per-metric definitions live under [metrics/](metrics/README.md).
