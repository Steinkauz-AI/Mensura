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
  const beforeIndex = keyedUnits(before);
  const afterIndex = keyedUnits(after);
  const added = collectAdded(afterIndex, beforeIndex);
  const changed = collectChanged(afterIndex, beforeIndex);
  const removed = collectRemoved(beforeIndex, afterIndex);

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

function collectAdded(
  afterIndex: Map<string, ComplexityUnit>,
  beforeIndex: Map<string, ComplexityUnit>,
): DiffUnitAdded[] {
  const added: DiffUnitAdded[] = [];
  for (const [key, unit] of afterIndex) {
    if (beforeIndex.has(key)) continue;
    added.push({
      path: unit.path,
      name: unit.name,
      startLine: unit.startLine,
      complexity: unit.complexity,
    });
  }
  return added;
}

function collectChanged(
  afterIndex: Map<string, ComplexityUnit>,
  beforeIndex: Map<string, ComplexityUnit>,
): DiffUnitChanged[] {
  const changed: DiffUnitChanged[] = [];
  for (const [key, unit] of afterIndex) {
    const prev = beforeIndex.get(key);
    if (!prev || prev.complexity === unit.complexity) continue;
    changed.push({
      path: unit.path,
      name: unit.name,
      startLine: unit.startLine,
      before: prev.complexity,
      after: unit.complexity,
      delta: unit.complexity - prev.complexity,
    });
  }
  return changed;
}

function collectRemoved(
  beforeIndex: Map<string, ComplexityUnit>,
  afterIndex: Map<string, ComplexityUnit>,
): DiffUnitRemoved[] {
  const removed: DiffUnitRemoved[] = [];
  for (const [key, unit] of beforeIndex) {
    if (afterIndex.has(key)) continue;
    removed.push({
      path: unit.path,
      name: unit.name,
      complexity: unit.complexity,
    });
  }
  return removed;
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
