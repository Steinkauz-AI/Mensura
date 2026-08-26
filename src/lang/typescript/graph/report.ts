import type { ComplexityReport, ComplexityUnit, FileComplexity } from "../source/types.js";

export function fileUnit(
  path: string,
  complexity: number,
  extra?: Omit<Partial<ComplexityUnit>, "path" | "name" | "kind" | "startLine" | "endLine" | "complexity">,
): ComplexityUnit {
  return {
    path,
    name: path,
    kind: "file",
    startLine: 1,
    endLine: 1,
    complexity,
    ...extra,
  };
}

export function fileReport(
  units: ComplexityUnit[],
  unparsed: ComplexityReport["unparsed"],
  score?: number,
): ComplexityReport {
  const sorted = [...units].sort(
    (a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name),
  );
  return {
    units: sorted,
    files: rollup(sorted),
    unparsed,
    ...(score !== undefined ? { score } : {}),
  };
}

function rollup(units: ComplexityUnit[]): FileComplexity[] {
  const byPath = new Map<string, FileComplexity>();
  for (const unit of units) {
    const existing = byPath.get(unit.path);
    if (!existing) {
      byPath.set(unit.path, {
        path: unit.path,
        functionCount: 1,
        minComplexity: unit.complexity,
        maxComplexity: unit.complexity,
        sumComplexity: unit.complexity,
      });
      continue;
    }
    existing.functionCount += 1;
    existing.sumComplexity += unit.complexity;
    if (unit.complexity > existing.maxComplexity) existing.maxComplexity = unit.complexity;
    if (unit.complexity < existing.minComplexity) existing.minComplexity = unit.complexity;
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
