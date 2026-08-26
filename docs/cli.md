# CLI (`mensura`)

Presentation layer over the engine. Human tables on a TTY (`NO_COLOR` disables). The agent contract is pinned by `tests/cli/contract.test.ts`. Programmatic consumers import the package rather than scraping CLI output. There is no `--json` flag.

## Commands

```bash
mensura                                    # help map plus status rollup; never waits
mensura -i                                 # Ink View/Run shell; TTY required
mensura list                               # registry table: id / name / status
mensura run <id> [root]                    # analyze, save a snapshot, print the overview
mensura run <id> --check [root]            # same overview; exit 2 if the catalog threshold is missed
mensura run --all [root]                   # every registered metric; one summary row each; save snapshots
mensura run --all --check [root]           # same dashboard; 2 if any fail, 1 if any error
mensura snapshot show <id> <ref>           # view a saved snapshot (latest | previous | file | timestamp)
mensura snapshot diff <id>                 # diff two refs (default previous vs latest)
mensura completion bash|zsh|fish           # print an installable completion script (stdout)
```

Bare `mensura` (and `mensura -h` / `--help`) print the same help map plus a live status rollup for cwd, then exit 0. They never enter Ink and never wait for input, TTY or not.

`mensura -i` / `--interactive` opens the Ink shell: a boxed catalog with a status column (`up-to-date` / `outdated` / `missing`, color-coded). Default is View — Enter inspects Snapshots (show, or `d` diff previous vs latest; space marks two for diff). Tab switches to Run — Space multi-selects, `a` all, `o` outdated+missing, Enter generates and stays on the catalog. `q` / Esc back or quit. Requires a TTY; without one it exits 1 immediately. `-i` cannot combine with a subcommand.

Explicit subcommands (`run`, `snapshot`, `list`, `completion`) never enter Ink — they print the same formatter output as the piped path (tables still color on a TTY unless `NO_COLOR`). Piped and non-interactive TTY share that path; neither waits for input.

## Output and thresholds

Stdout is a bounded table (`--top` / `--min` / `--file`); sliced listings print `…and N more` for the leftover of the current selection. Listing flags do not change the threshold block — threshold always uses the full report. `run`, `snapshot show`, and interactive inspect always append the configured threshold (from `.mensura/config.json`, catalog defaults when unset) and its violators on the full report. `--min` is a listing slice only.

On first use against a checkout, the CLI writes `.mensura/config.json` with catalog defaults when that file is missing (`mensura completion` does not). Edit `metrics.<id>.threshold` and `metrics.<id>.bands` there; see [engine.md](engine.md#thresholds-and-bands-metrics).

`list` adds a status column. `snapshot show` / `diff` print `outdated` when an opened Snapshot is not a Current Snapshot (including when hashing fails), then still print the table (exit 0). The full report is the snapshot on disk.

A metric id is required on `run <id>` / `snapshot show` / `snapshot diff` / `run --check`. `run --all` evaluates every registered metric and prints one summary row each (`pass` / `fail` / `error`, function/file stats, configured threshold, threshold violations); a positional that is a metric id is a usage error.

Coverage-backed metrics share a single `test:coverage` run per batch; a single `run` of one coverage-backed metric also fills other coverage-backed metrics that are not current. `--check` does not change stdout; it only maps a catalog miss to exit 2 (and may save Snapshots; `--no-save` does not). A metric that errors is reported as `error` and the rest continue.

Hottest-units ranking: Halstead effort when present; otherwise primary score. Higher-better scores invert so low is hot.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (including help). `--all` without `--check` stays 0 even with `error` or `fail` rows. |
| 1 | Usage or runtime error (also `--all --check` when any row is `error`). |
| 2 | Gate failed (`run --check` / `run --all --check` with a `fail` and no `error`). |

## Interactive screen recovery

After a child process writes to the TTY, Ink’s next paint only erases the last frame height — leftover lines can remain. The shell wipes the terminal (`\x1b[2J\x1b[H`) so the following render is the only copy.

## Tab completion

Covers subcommands, metric ids from the registry, snapshot refs (`latest`, `previous`), and flags per subcommand. The script is generated from the Commander tree at print time, so regenerate after adding a metric. PowerShell is not supported.

```bash
# bash — eval in the shell rc
eval "$(mensura completion bash)"

# zsh — write into fpath (create ~/.zfunc first if needed)
mensura completion zsh > ~/.zfunc/_mensura
# then in ~/.zshrc: fpath=(~/.zfunc $fpath); autoload -U compinit && compinit

# fish
mensura completion fish > ~/.config/fish/completions/mensura.fish
```

## Local PATH link

Clone this repo, install, build, and put the binary on PATH:

```bash
pnpm install
pnpm build
pnpm mensura:link
```

`pnpm mensura:link` places `bin/mensura.mjs` on PATH. pnpm 10’s `pnpm link` is not usable here: it is workspace-root oriented, requires a `<dir>`, and global bins land in `$PNPM_HOME`, which is often not on PATH on Unix.

- **Unix:** symlink `~/.local/bin/mensura` → `bin/mensura.mjs`.
- **Windows:** shims in `$PNPM_HOME` (`mensura.CMD` / `mensura.ps1`).

Without a prior `pnpm build`, the linked binary falls back to `tsx` (fine for development). Remove with `pnpm mensura:unlink`.
