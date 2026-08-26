# `maintainability-index`

Microsoft 0–100 index from Halstead volume, McCabe cyclomatic complexity, and logical SLOC. No comment term.

- **Grain:** function
- **Direction:** higher-better
- **Catalog min:** **20**
- **Bands:** `50-100` / `20-49` / `10-19` / `0-9`

## Formula

`max(0, (171 − 5.2·ln(V) − 0.23·CC − 16.2·ln(LOC)) × 100 / 171)`.

LOC is logical SLOC: distinct lines with a non-trivia token in this unit, skipping nested function-likes and type syntax. V and LOC are floored at 1 so `ln` is defined. Comments and blank lines never appear as tokens so they do not count.

## Rationale

VS rates 20–100 green, 10–19 yellow, 0–9 red. The 50 split inside green is scaled SEI 85 (`85 × 100/171 ≈ 50`). Catalog min 20 is the VS green floor.

## Source

Microsoft Visual Studio Maintainability Index; SEI 85 scaled to 0–100.
