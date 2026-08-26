import type { ComplexityUnit } from "../../lang/typescript/source/index.js";
import type { CoverageMaps } from "./load.js";


export function coveragePercent(
  unit: ComplexityUnit,
  all: readonly ComplexityUnit[],
  maps: CoverageMaps,
): number {
  const statements = maps.get(unit.path);
  if (statements === undefined) return 0;
  const nested = all.filter(
    (other) =>
      other !== unit &&
      other.path === unit.path &&
      other.startLine >= unit.startLine &&
      other.endLine <= unit.endLine &&
      (other.startLine > unit.startLine || other.endLine < unit.endLine),
  );
  const own = statements.filter((statement) => {
    if (statement.startLine < unit.startLine || statement.startLine > unit.endLine) {
      return false;
    }
    return !nested.some(
      (inner) =>
        statement.startLine >= inner.startLine && statement.startLine <= inner.endLine,
    );
  });
  if (own.length === 0) return 100;
  const hit = own.filter((statement) => statement.hits > 0).length;
  return Math.round((hit / own.length) * 100);
}
