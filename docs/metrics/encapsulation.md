# `encapsulation`

Count of inbound **leaked** imports: another package imports this file other than through that package’s declared interface (`package.json` `"exports"` if present, else `src/index.ts` / `index.ts`). Export entries use the same interpretation as import resolution (exact `"."` / `"./subpath"` keys, nested `import`/`default` conditional targets, `dist` targets mapped back to their `src` source twin). Same-package edges are not leaks. A checkout with a single package has no leaks.

- **Grain:** structure
- **Direction:** higher-worse
- **Catalog max:** **0**
- **Bands:** `0` / `1` / `2-4` / `5+`

## Source

Martin package design (public vs private packages); Feathers, *Working Effectively with Legacy Code* (seam / interface vs implementation).
