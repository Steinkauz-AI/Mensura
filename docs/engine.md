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

### Snapshot retention (`maxSnapshots`)

Optional top-level positive integer (default 20). Caps how many snapshot files each metric keeps under `.mensura/metrics/<id>/`. Eviction runs on the next save only; loading config or checking status does not prune. Non-integers and values below 1 fail at parse.

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

Structure metrics share an in-memory directed graph: source files as nodes, static import/export/`require`/`import()` specifiers as edges. Relative specifiers resolve with TypeScript’s `.js` → `.ts` extension rewrite and `index` files. Bare specifiers resolve through project path aliases (below) or a `package.json` `name` found in the checkout (workspace packages); source under `node_modules` is never followed. A workspace package root resolves through its `exports` `"."` entry when present, and a package subpath through its matching `"./subpath"` entry, including nested `import`/`default` conditional targets; a `dist` target falls back to its `src` source twin. Packages without `exports` keep the conventional `src/index` / `index` fallback, and subpaths with no matching export entry still resolve physically, so deep imports that bypass the declared interface produce edges for encapsulation to report. Export targets that do not resolve to a supported source file are ignored. Import resolution and encapsulation public-file detection share the same export-target interpretation (`src/lang/typescript/graph/exports.ts`). Encapsulation treats `exports` as the declared interface whenever the field is present, so an empty or non-source map does not fall back to `src/index`. `import type` is still an edge (structural coupling). Test files (`*.test.*` / `*.spec.*` on basename, or any path under a `tests` / `__tests__` directory) are omitted. The graph is an intermediate, like the AST — it is not persisted. JSON snapshots under `.mensura/metrics/<id>/` remain the store; there is no graph database.

### TypeScript and JavaScript path aliases

Before workspace-package resolution, bare imports use the importing file's nearest `tsconfig.json` or `jsconfig.json` (TypeScript wins when both exist in one directory). Config discovery stops at the checkout root. TypeScript's config parser handles JSONC, `extends`, `baseUrl`, and `paths`; inherited relative paths remain relative to the config that declared them. Mensura can measure a checkout without installing its dependencies: if an `extends` target is missing, unreadable, or outside the checkout, that config supplies empty options, so neither its local nor inherited aliases or `baseUrl` apply. This includes relative files, `@tsconfig/*` packages, and `next/tsconfig.json`. Relative imports and workspace-package exports still resolve. Malformed configs, non-object roots (`[]`, `null`), and circular `extends` remain errors, including when another target is unavailable.

Alias matching follows TypeScript's exact-key and longest-wildcard-prefix rules, including ordered fallback targets. Resolution probes only Mensura's scored production files, so aliases cannot add skipped files, tests, declarations, outside-checkout files, or installed dependency source to the graph. The target need not build or typecheck, and its `include`/`exclude` settings do not replace Mensura's source-selection rules. Project references do not select configs; each source uses its nearest config.

## Input hash

Scored inputs are walked source files, root `package.json`, `.mensura/config.json`, and the project configs used by those sources (including configs read through `extends`). Adding, removing, or editing a relevant project config invalidates snapshots. Config paths are checkout-relative so moving an unchanged checkout does not change its hash. All-grains `skipPaths` leave files out of the hash; grain-scoped rules keep them hashed (raw config text is hashed either way).

## Snapshots

Compact JSON under `<checkout>/.mensura/metrics/<metric>/` with a per-metric `manifest.json` (`latest` / `previous` / file name / timestamp). Retention: newest `maxSnapshots` from `.mensura/config.json` (default 20; positive integer, no upper bound). Eviction runs on save only. Atomic writes. `evaluateMetric` reuses any Snapshot whose scored-input hash matches (a Current Snapshot), not only latest. `latest` remains newest-on-disk. `checkoutStatus` reports per-metric status (`up-to-date` / `outdated` / `missing`).

### Coverage piggyback

When coverage prepare must run and save is on, other coverage-backed metrics that are not current are measured and saved too. A sibling failure must not hide success of the requested metric. `evaluateAllMetrics` runs `test:coverage` at most once: today every `metric.prepare` hook is a coverage refresh, so that path calls `ensureTestCoverage` directly and sets `skipPrepare` rather than running each hook. A future non-coverage `prepare` must not be skipped here.

## Metric catalog

Per-metric definitions live under [metrics/](metrics/README.md).
