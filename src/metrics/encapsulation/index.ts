import { analyzeEncapsulation } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeEncapsulation } from "./analyze.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "encapsulation",
  name: "Encapsulation",
  direction: "higher-worse",
  grain: "structure",
  analyze: analyzeEncapsulation,
  diff: diffComplexity,
};
