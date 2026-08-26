import { analyzeHalstead } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeHalstead } from "./analyze.js";
export type { HalsteadMeasures } from "../../lang/typescript/scoring/halstead-score.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "halstead",
  name: "Halstead",
  direction: "higher-worse",
  grain: "function",
  analyze: analyzeHalstead,
  diff: diffComplexity,
};
