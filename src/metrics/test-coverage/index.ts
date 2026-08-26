import { analyzeCoverage } from "./analyze.js";
import { ensureTestCoverage } from "./ensure.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeCoverage } from "./analyze.js";
export { ensureTestCoverage } from "./ensure.js";
export type { CoverageCommand } from "./ensure.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "test-coverage",
  name: "Test coverage",
  direction: "higher-better",
  grain: "function",
  analyze: analyzeCoverage,
  diff: diffComplexity,
  prepare: ensureTestCoverage,
};
