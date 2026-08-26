import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { MENSURA_DIR } from "../../../core/config/index.js";

export const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "build",
  ".next",
  "out",
  "vendor",
  MENSURA_DIR,
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const WALK_CONCURRENCY = 8;

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function isSourceFileName(name: string): boolean {
  if (name.endsWith(".d.ts") || name.endsWith(".d.mts") || name.endsWith(".d.cts")) {
    return false;
  }
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return SOURCE_EXTENSIONS.has(name.slice(dot));
}

export async function listSourceFiles(
  startDir: string,
  include: string[] | undefined,
  skipDirs: ReadonlySet<string>,
): Promise<string[]> {
  const out: string[] = [];
  let queue: string[] = [startDir];
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
          if (!skipDirs.has(entry.name)) next.push(abs);
          continue;
        }
        if (!entry.isFile() || !isSourceFileName(entry.name)) continue;
        const rel = toPosix(relative(startDir, abs));
        if (include && !include.includes(rel)) continue;
        out.push(abs);
      }
    }
    queue.push(...next);
  }
  out.sort();
  return out;
}
