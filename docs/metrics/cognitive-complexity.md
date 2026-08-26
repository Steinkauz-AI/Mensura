# `cognitive-complexity`

SonarSource cognitive complexity per function (base 0; nesting increments).

- **Grain:** function
- **Direction:** higher-worse
- **Catalog max:** **15**
- **Bands:** `0-10` / `11-15` / `16-25` / `26+`

## Model

SonarSource whitepaper v1.7: no cost of entry, nesting increments, one increment per `switch`, sequences of `&&`/`||` rather than per operator, `??` ignored, labeled `break`/`continue`, direct recursion +1. Nested function-likes are their own units.

## Rationale

No McCabe-style table. Sonar S3776 started at 10 (noisy), settled on 15 for JS/TS and 25 for C/C++/Objective-C. The catalog ceiling is the JS/TS default.

## Source

SonarSource, *Cognitive Complexity* whitepaper v1.7; rule S3776.
