# `nesting-depth`

Maximum control-flow nest (`if` / `for` / `while` / `do` / `switch` / `catch` / ternary).

- **Grain:** function
- **Direction:** higher-worse
- **Catalog max:** **3**
- **Bands:** `0-1` / `2-3` / `4-5` / `6+`

## Model

Depth counts those constructs — not braces, `&&` / `||`, `try`, or `finally`. `else if` stays at the same depth as the `if` it continues.

## Rationale

Sonar S134 (JS default 3) and ESLint `max-depth` / HIS LEVEL (4). Depth 3 still meets the catalog ceiling; 4 is the first miss.

## Source

Sonar S134; ESLint `max-depth` / HIS LEVEL.
