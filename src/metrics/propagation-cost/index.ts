import { analyzePropagationCost } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzePropagationCost } from "./analyze.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "propagation-cost",
  name: "Propagation cost",
  direction: "higher-worse",
  grain: "structure",
  analyze: analyzePropagationCost,
  diff: diffComplexity,
};
