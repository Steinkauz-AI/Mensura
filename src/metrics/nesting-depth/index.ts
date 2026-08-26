import { analyzeNestingDepth } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeNestingDepth } from "./analyze.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "nesting-depth",
  name: "Nesting depth",
  direction: "higher-worse",
  grain: "function",
  analyze: analyzeNestingDepth,
  diff: diffComplexity,
};
