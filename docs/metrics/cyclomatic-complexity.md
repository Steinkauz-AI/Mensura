# `cyclomatic-complexity`

McCabe cyclomatic complexity per function (base 1; +1 per independent path).

- **Grain:** function
- **Direction:** higher-worse
- **Catalog max:** **20**
- **Bands:** `1-10` / `11-20` / `21-50` / `51+`

## Rationale

Bands follow McCabe’s later DHS risk table (1–10 / 11–20 / 21–50 / >50). NIST SP 500-235’s limit of 10 is the green/yellow edge, not the catalog ceiling — the check bar is 20.

## Source

McCabe, *A Complexity Measure* (IEEE TSE, 1976); NIST SP 500-235; DHS *Software Quality Metrics to Identify Risk*.
