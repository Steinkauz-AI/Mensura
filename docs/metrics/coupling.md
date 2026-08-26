# `coupling`

Martin file-level coupling. Primary score is **Ce** (efferent: distinct files this file imports). **Ca** (afferent: importers) and **I = Ce / (Ca + Ce)** sit beside it. Isolated files have I = 0.

- **Grain:** structure
- **Direction:** higher-worse
- **Catalog max:** **15** (Ce)
- **Bands:** `0-5` / `6-10` / `11-20` / `21+`

## Source

Martin, *Object Oriented Design Quality Metrics: An Analysis of Dependencies* (1994); *Agile Software Development, Principles, Patterns, and Practices*.
