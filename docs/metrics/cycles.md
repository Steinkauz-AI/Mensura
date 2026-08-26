# `cycles`

Size of the file’s strongly connected component. Isolated files score 0; a file in a cycle of *n* files scores *n*.

- **Grain:** structure
- **Direction:** higher-worse
- **Catalog max:** **0** (any cycle fails)
- **Bands:** `0` / `2-3` / `4-10` / `11+`

## Rationale

Bands follow small-cycle vs tangled-cluster size, not a published table. A 2-cycle is the first red flag.

## Source

Tarjan, *Depth-First Search and Linear Graph Algorithms* (SIAM, 1972); Lakos, *Large-Scale C++ Software Design* (cyclic physical dependencies).
