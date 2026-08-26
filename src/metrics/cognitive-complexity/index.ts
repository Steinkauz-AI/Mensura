import { analyzeCognitiveComplexity } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeCognitiveComplexity } from "./analyze.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "cognitive-complexity",
  name: "Cognitive complexity",
  direction: "higher-worse",
  grain: "function",
  analyze: analyzeCognitiveComplexity,
  diff: diffComplexity,
};
