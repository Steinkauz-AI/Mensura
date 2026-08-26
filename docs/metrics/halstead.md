# `halstead`

Halstead volume, difficulty, and effort per function. Volume is the primary score; effort ranks the list when present.

- **Grain:** function
- **Direction:** higher-worse
- **Catalog max:** **1000** (volume)
- **Bands:** `1-20` / `21-100` / `101-1000` / `1001+` (volume). Difficulty is reported, not banded.

## Token model

- Nested function-likes are their own units (same unit model as cyclomatic / cognitive). Type syntax is skipped so a type annotation cannot change the score.
- Tokens are classified from the AST (format-stable: comments, whitespace, and semicolons do not count). The unit’s own name is the label, not an operand.
- Grouping `( ) { } [ ]` counts; that is what puts a parameterless `return 1` one-liner near volume 20 (Verifysoft / Testwell CMT++).
- Heritage clauses (`extends Base<X>`) are runtime expressions even when the node kind satisfies `isTypeNode` — count the extends expression; do not treat the whole clause as skipped type syntax.
- Formulas: `V = N log2 n`, `D = (n1/2)·(N2/n2)`, `E = V·D`. Empty operand set ⇒ `D = 0`.

## Rationale

Non-empty one-liner ≈ 20; above 1000 does too many things. The 21–100 split is interpolated.

## Source

Halstead, *Elements of Software Science* (1977); Testwell CMT++ / Verifysoft function-level volume ranges.
