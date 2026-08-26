# `propagation-cost`

Per-file visibility percent: how many other files this file can reach on the directed graph, divided by *n − 1*, as 0–100. The report also carries a system **score**: density of the visibility matrix excluding the diagonal (MacCormack propagation cost × 100). Self-reach does not count, so a fully disconnected graph scores 0.

- **Grain:** structure
- **Direction:** higher-worse
- **Catalog max:** **50** (per-file visibility)
- **Bands:** `0-20` / `21-40` / `41-60` / `61+`

## Source

MacCormack, Rusnak, Baldwin, *Exploring the Structure of Complex Software Systems* (Management Science, 2006).
