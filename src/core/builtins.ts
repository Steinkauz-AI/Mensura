import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { registerMetric, type AnyMetric } from "./registry.js";

let loading: Promise<void> | null = null;
let loaded = false;

/**
 * Load built-in metrics as plugins. Specifiers are runtime file URLs (not string
 * literals), so the static import graph does not treat core as a hub that reaches
 * every analyzer.
 */
export function ensureBuiltinMetrics(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) loading = loadBuiltins();
  return loading;
}

async function loadBuiltins(): Promise<void> {
  const metricsDir = fileURLToPath(new URL("../metrics", import.meta.url));
  for (const id of await discoverBuiltinIds(metricsDir)) {
    const mod = await importMetric(metricsDir, id);
    if (!mod.metric) {
      throw new Error(`builtin metric module "${id}" does not export metric`);
    }
    registerMetric(mod.metric);
  }
  loaded = true;
}

async function discoverBuiltinIds(metricsDir: string): Promise<string[]> {
  const entries = await readdir(metricsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** @internal Test hook — allows ensureBuiltinMetrics to reload after clearMetrics(). */
export function resetBuiltinMetricsForTests(): void {
  loaded = false;
  loading = null;
}

async function importMetric(
  metricsDir: string,
  id: string,
): Promise<{ metric?: AnyMetric }> {
  const errors: unknown[] = [];
  for (const name of [`index.js`, `index.ts`]) {
    const href = pathToFileURL(join(metricsDir, id, name)).href;
    try {
      // @vite-ignore — absolute file URL; not analyzable as a static graph edge
      return (await import(/* @vite-ignore */ href)) as { metric?: AnyMetric };
    } catch (err) {
      errors.push(err);
    }
  }
  throw new Error(
    `failed to load builtin metric "${id}": ${errors.map(String).join("; ")}`,
  );
}
