# Metric catalog

Each metric is one registry id under `src/metrics/<id>/`. Function-grain metrics score a function-like unit; structure-grain metrics score a source file on the checkout’s import graph. Primary score is always stored on `complexity`. The snapshot view always shows the configured threshold (`max` when higher is worse, `min` when higher is better; catalog values below are the defaults in `.mensura/config.json`). `mensura run --check` uses that same bar for exit 2.

TypeScript/JavaScript only today. Shared function walk: `src/lang/typescript/source/`. Shared import graph: `src/lang/typescript/graph/`. Nested functions are their own units; the outer score does not include the inner body. Test files (`*.test.*` / `*.spec.*` on basename, or any path under a `tests` / `__tests__` directory) are omitted from coverage, CRAP, and the import graph.

## Function grain

| Id | Direction | Check | Bands |
|----|-----------|-------|-------|
| [cyclomatic-complexity](cyclomatic-complexity.md) | higher-worse | max **20** | `1-10` / `11-20` / `21-50` / `51+` |
| [cognitive-complexity](cognitive-complexity.md) | higher-worse | max **15** | `0-10` / `11-15` / `16-25` / `26+` |
| [halstead](halstead.md) | higher-worse | max **1000** (volume) | `1-20` / `21-100` / `101-1000` / `1001+` |
| [nesting-depth](nesting-depth.md) | higher-worse | max **3** | `0-1` / `2-3` / `4-5` / `6+` |
| [maintainability-index](maintainability-index.md) | higher-better | min **20** | `50-100` / `20-49` / `10-19` / `0-9` |
| [test-coverage](test-coverage.md) | higher-better | min **50** | `80-100` / `50-79` / `20-49` / `0-19` |
| [crap](crap.md) | higher-worse | max **30** | `1-8` / `9-15` / `16-30` / `31+` |

## Structure grain

| Id | Direction | Check | Bands |
|----|-----------|-------|-------|
| [cycles](cycles.md) | higher-worse | max **0** | `0` / `2-3` / `4-10` / `11+` |
| [coupling](coupling.md) | higher-worse | max **15** (Ce) | `0-5` / `6-10` / `11-20` / `21+` |
| [encapsulation](encapsulation.md) | higher-worse | max **0** | `0` / `1` / `2-4` / `5+` |
| [propagation-cost](propagation-cost.md) | higher-worse | max **50** | `0-20` / `21-40` / `41-60` / `61+` |
