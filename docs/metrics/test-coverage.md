# `test-coverage`

Statement coverage percent 0–100 per function, joined from Istanbul maps onto function line spans.

- **Grain:** function
- **Direction:** higher-better
- **Catalog min:** **50**
- **Bands:** `80-100` / `50-79` / `20-49` / `0-19`

## Runner

Runs the checkout’s `test:coverage` script first (only when the metric must measure again). Spawn uses `shell: false` — `shell: true` leaks TTY output and trips Node DEP0190. On Windows the spawn uses `ComSpec` / `cmd.exe` with `/d /s /c`; on Unix it runs the package manager binary directly (`npm` or `pnpm`, chosen by presence of `pnpm-lock.yaml`).

Istanbul load: `coverage/` directories are searched (unlike the source walk). A missing `coverage-final.json` is an error, not zeros. Test files (`*.test.*` / `*.spec.*` on basename, or any path under a `tests` / `__tests__` directory) are omitted.

## Rationale

Istanbul/nyc watermarks 80 high / 50 low; below 50 splits at 20. Catalog min 50 matches the low watermark.

## Source

Istanbul / nyc coverage watermarks.
