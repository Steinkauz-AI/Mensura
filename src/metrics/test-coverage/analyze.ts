import { analyzeFunctionScores } from "../../lang/typescript/source/index.js";
import type { ComplexityReport, ComplexityUnit, FileComplexity } from "../../lang/typescript/source/index.js";
import { loadCoverageStatementMaps } from "./load.js";
import { coveragePercent } from "./score.js";
import { isTestSourcePath } from "../../lang/typescript/source/test-path.js";


export async function analyzeCoverage(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  const maps = await loadCoverageStatementMaps(root);
  const walked = await analyzeFunctionScores(root, () => 0, options);
  const production = walked.units.filter((unit) => !isTestSourcePath(unit.path));
  const units = production.map((unit) => ({
    ...unit,
    complexity: coveragePercent(unit, production, maps),
  }));
  return {
    units,
    files: rollup(units),
    unparsed: walked.unparsed.filter((file) => !isTestSourcePath(file.path)),
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
    if (unit.complexity > existing.maxComplexity) {
      existing.maxComplexity = unit.complexity;
    }
    if (unit.complexity < existing.minComplexity) {
      existing.minComplexity = unit.complexity;
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
