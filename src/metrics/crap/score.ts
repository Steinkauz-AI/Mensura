
export function crapScore(cyclomatic: number, coveragePercent: number): number {
  const uncovered = Math.min(1, Math.max(0, 1 - coveragePercent / 100));
  return Math.round((cyclomatic * cyclomatic * uncovered ** 3 + cyclomatic) * 100) / 100;
}

export type CrapMeasures = {
  crap: number;
  cyclomatic: number;
  coverage: number;
};
