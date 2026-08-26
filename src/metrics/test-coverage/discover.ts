import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { MENSURA_DIR } from "../../core/config/index.js";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "build",
  ".next",
  "out",
  "vendor",
  MENSURA_DIR,
]);

const ARTIFACT = "coverage-final.json";
const WALK_CONCURRENCY = 8;


export async function findCoverageArtifacts(root: string): Promise<string[]> {
  const out: string[] = [];
  let queue: string[] = [root];
  while (queue.length > 0) {
    const batch = queue.splice(0, WALK_CONCURRENCY);
    const scanned = await Promise.all(
      batch.map(async (dir) => {
        const entries = await readdir(dir, { withFileTypes: true });
        return [dir, entries] as const;
      }),
    );
    const next: string[] = [];
    for (const [dir, entries] of scanned) {
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) next.push(abs);
          continue;
        }
        if (entry.isFile() && entry.name === ARTIFACT) out.push(abs);
      }
    }
    queue.push(...next);
  }
  out.sort();
  return out;
}
