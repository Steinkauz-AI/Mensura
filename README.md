# Mensura

Mensura is a CLI for **deterministic code-quality metrics** on TypeScript and JavaScript checkouts. It scores complexity, coverage, and structure the same way every time, writes **snapshots** under `.mensura/`, and lets you **diff** them over time.

It is built first for **agentic workflows**—stable tables, predictable exit codes, and reuse of current snapshots so agents do not remeasure blindly. The same commands work in **CI** (gates via `run --check`) and for **humans** (including an interactive TTY shell).

## Quick start

To use the CLI, **clone** this repo, **install** dependencies, **build**, then **link** so `mensura` is on your PATH.

```bash
git clone https://github.com/Steinkauz-AI/Mensura.git
cd Mensura
pnpm install
pnpm build
pnpm mensura:link
```

Remove the link anytime with `pnpm mensura:unlink`. See [docs/cli.md](docs/cli.md#local-path-link) for how linking works.

### Humans

Explore interactively, or run metrics one at a time:

```bash
mensura -i                              # interactive View / Run shell (TTY required)
```

### Agents and CI

Prefer non-interactive commands. Status is informational; gates use `--check` and exit codes (`0` ok, `1` usage/runtime, `2` threshold miss).

```bash
mensura                                 # help + status rollup
mensura list
mensura run --all --check               # measure everything; exit 2 on catalog misses
mensura run cyclomatic-complexity --check
mensura snapshot diff cyclomatic-complexity
```

## Documentation

Product and reference docs live in [docs/](docs/): [concepts](docs/concepts.md), [engine](docs/engine.md), [CLI](docs/cli.md), and the [metric catalog](docs/metrics/README.md) (one page per metric).

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md). Same rules for humans and coding agents. Node 22+ and pnpm (pinned via `packageManager`; `corepack enable` works).

```bash
pnpm install
pnpm run ci
```
