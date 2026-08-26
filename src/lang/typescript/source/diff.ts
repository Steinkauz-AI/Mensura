import type { ComplexityReport, ComplexityUnit } from "./types.js";

export type DiffUnitAdded = {
  path: string;
  name: string;
  startLine: number;
  complexity: number;
};

export type DiffUnitRemoved = {
  path: string;
  name: string;
  complexity: number;
};

export type DiffUnitChanged = {
  path: string;
  name: string;
  startLine: number;
  before: number;
  after: number;
  delta: number;
};

export type ComplexityDiff = {
  added: DiffUnitAdded[];
  removed: DiffUnitRemoved[];
  changed: DiffUnitChanged[];
  totalDelta: number;
};


export function diffComplexity(
  before: ComplexityReport,
  after: ComplexityReport,
): ComplexityDiff {
  const added: DiffUnitAdded[] = [];
  const removed: DiffUnitRemoved[] = [];
  const changed: DiffUnitChanged[] = [];

  const beforeIndex = keyedUnits(before);
  const afterIndex = keyedUnits(after);

  for (const [key, unit] of afterIndex) {
    const prev = beforeIndex.get(key);
    if (!prev) {
      added.push({
        path: unit.path,
        name: unit.name,
        startLine: unit.startLine,
        complexity: unit.complexity,
      });
      continue;
    }
    if (prev.complexity !== unit.complexity) {
      changed.push({
        path: unit.path,
        name: unit.name,
        startLine: unit.startLine,
        before: prev.complexity,
        after: unit.complexity,
        delta: unit.complexity - prev.complexity,
      });
    }
  }
  for (const [key, unit] of beforeIndex) {
    if (!afterIndex.has(key)) {
      removed.push({
        path: unit.path,
        name: unit.name,
        complexity: unit.complexity,
      });
    }
  }

  added.sort(unitOrder);
  removed.sort(unitOrder);
  changed.sort(unitOrder);

  return {
    added,
    removed,
    changed,
    totalDelta: changed.reduce((sum, entry) => sum + entry.delta, 0),
  };
}


function keyedUnits(report: ComplexityReport): Map<string, ComplexityUnit> {
  const seen = new Map<string, number>();
  const index = new Map<string, ComplexityUnit>();
  for (const unit of report.units) {
    const base = `${unit.path}\u0000${unit.kind}\u0000${unit.name}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    index.set(`${base}\u0000${occurrence}`, unit);
  }
  return index;
}

function unitOrder(
  a: { path: string; name: string; startLine?: number },
  b: { path: string; name: string; startLine?: number },
): number {
  return (
    a.path.localeCompare(b.path) ||
    a.name.localeCompare(b.name) ||
    (a.startLine ?? 0) - (b.startLine ?? 0)
  );
}
