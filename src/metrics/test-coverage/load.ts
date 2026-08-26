import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { MENSURA_DIR } from "../../core/config/index.js";
import { toPosix } from "../../lang/typescript/source/walk.js";

const ARTIFACT = "coverage-final.json";
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

export type StatementHit = {
  startLine: number;
  hits: number;
};


export type CoverageMaps = Map<string, StatementHit[]>;

type CoverageFile = {
  path?: string;
  statementMap?: Record<string, { start?: { line?: number } }>;
  s?: Record<string, number>;
};


export async function loadCoverageStatementMaps(root: string): Promise<CoverageMaps> {
  const artifacts = await listArtifacts(root);
  if (artifacts.length === 0) {
    throw new Error(`No ${ARTIFACT} found in the checkout.`);
  }
  const maps: CoverageMaps = new Map();
  for (const artifact of artifacts) {
    await mergeArtifact(root, artifact, maps);
  }
  return maps;
}

async function mergeArtifact(
  root: string,
  artifact: string,
  maps: CoverageMaps,
): Promise<void> {
  const raw = JSON.parse(await readFile(artifact, "utf8")) as Record<string, CoverageFile>;
  for (const [key, file] of Object.entries(raw)) {
    mergeFileCoverage(root, key, file, maps);
  }
}

function mergeFileCoverage(
  root: string,
  key: string,
  file: CoverageFile,
  maps: CoverageMaps,
): void {
  const abs = file.path ?? key;
  const rel = toPosix(relative(root, abs));
  const existing = maps.get(rel) ?? [];
  const statementMap = file.statementMap ?? {};
  const hits = file.s ?? {};
  for (const [id, loc] of Object.entries(statementMap)) {
    const startLine = loc.start?.line;
    if (startLine === undefined) continue;
    existing.push({ startLine, hits: hits[id] ?? 0 });
  }
  maps.set(rel, existing);
}

async function listArtifacts(root: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    await scanArtifactDir(dir, out, queue);
  }
  return out.sort();
}

async function scanArtifactDir(
  dir: string,
  out: string[],
  queue: string[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    considerArtifactEntry(dir, entry, out, queue);
  }
}

function considerArtifactEntry(
  dir: string,
  entry: { name: string; isDirectory(): boolean; isFile(): boolean },
  out: string[],
  queue: string[],
): void {
  const abs = join(dir, entry.name);
  if (entry.isDirectory()) {
    if (!SKIP_DIRS.has(entry.name)) queue.push(abs);
    return;
  }
  if (entry.isFile() && entry.name === ARTIFACT) out.push(abs);
}
