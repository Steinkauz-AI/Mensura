import { isAbsolute, join, relative } from "node:path";
import { toPosix } from "../../lang/typescript/source/walk.js";

export type CoveredStatement = {
  startLine: number;
  hits: number;
};

export type FileStatementMap = CoveredStatement[];

type IstanbulLocation = {
  start?: { line?: unknown };
};

type IstanbulFile = {
  path?: unknown;
  statementMap?: unknown;
  s?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function lineOf(value: unknown): number | undefined {
  if (!isRecord(value) || typeof value.line !== "number" || !Number.isFinite(value.line)) {
    return undefined;
  }
  return value.line;
}


export function statementsFromIstanbul(
  root: string,
  raw: unknown,
): Map<string, FileStatementMap> {
  const files = new Map<string, FileStatementMap>();
  if (!isRecord(raw)) return files;
  for (const [key, entry] of Object.entries(raw)) {
    const rel = toCheckoutPath(root, (isRecord(entry) && typeof entry.path === "string" ? entry.path : key));
    if (!rel) continue;
    const parsed = parseFile(entry);
    if (!parsed) continue;
    const existing = files.get(rel) ?? [];
    files.set(rel, mergeStatements(existing, parsed));
  }
  return files;
}

export function mergeCoverageMaps(
  into: Map<string, FileStatementMap>,
  from: Map<string, FileStatementMap>,
): void {
  for (const [path, statements] of from) {
    into.set(path, mergeStatements(into.get(path) ?? [], statements));
  }
}

export function toCheckoutPath(root: string, reported: string): string | null {
  const abs = isAbsolute(reported) ? reported : join(root, reported);
  const rel = toPosix(relative(root, abs));
  if (!rel || rel.startsWith("..")) return null;
  return rel;
}

function parseFile(entry: unknown): FileStatementMap | undefined {
  if (!isRecord(entry)) return undefined;
  const file = entry as IstanbulFile;
  if (!isRecord(file.statementMap) || !isRecord(file.s)) return undefined;
  const statements: CoveredStatement[] = [];
  for (const [id, loc] of Object.entries(file.statementMap)) {
    const startLine = startLineOf(loc);
    if (startLine === undefined) continue;
    const hitsRaw = file.s[id];
    const hits = typeof hitsRaw === "number" && Number.isFinite(hitsRaw) ? hitsRaw : 0;
    statements.push({ startLine, hits });
  }
  return statements;
}

function startLineOf(loc: unknown): number | undefined {
  if (!isRecord(loc)) return undefined;
  const location = loc as IstanbulLocation;
  return lineOf(location.start);
}

function mergeStatements(
  left: FileStatementMap,
  right: FileStatementMap,
): FileStatementMap {
  const byLine = new Map<number, number>();
  for (const statement of [...left, ...right]) {
    const prev = byLine.get(statement.startLine) ?? 0;
    byLine.set(statement.startLine, Math.max(prev, statement.hits));
  }
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startLine, hits]) => ({ startLine, hits }));
}
