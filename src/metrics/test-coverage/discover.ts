import type { Dirent } from "node:fs";
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
    const scanned = await readDirBatch(batch);
    queue.push(...collectArtifacts(scanned, out));
  }
  out.sort();
  return out;
}

async function readDirBatch(
  batch: string[],
): Promise<readonly (readonly [string, Dirent[]])[]> {
  return Promise.all(
    batch.map(async (dir) => {
      const entries = await readdir(dir, { withFileTypes: true });
      return [dir, entries] as const;
    }),
  );
}

function collectArtifacts(
  scanned: readonly (readonly [string, Dirent[]])[],
  out: string[],
): string[] {
  const next: string[] = [];
  for (const [dir, entries] of scanned) {
    for (const entry of entries) {
      considerArtifactEntry(dir, entry, out, next);
    }
  }
  return next;
}

function considerArtifactEntry(
  dir: string,
  entry: Dirent,
  out: string[],
  next: string[],
): void {
  const abs = join(dir, entry.name);
  if (entry.isDirectory()) {
    if (!SKIP_DIRS.has(entry.name)) next.push(abs);
    return;
  }
  if (entry.isFile() && entry.name === ARTIFACT) out.push(abs);
}
