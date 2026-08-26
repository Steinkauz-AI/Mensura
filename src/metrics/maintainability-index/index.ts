import { analyzeMaintainability } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeMaintainability } from "./analyze.js";
export type { MaintainabilityMeasures } from "../../lang/typescript/scoring/maintainability.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "maintainability-index",
  name: "Maintainability index",
  direction: "higher-better",
  grain: "function",
  analyze: analyzeMaintainability,
  diff: diffComplexity,
};
