import { analyzeCoupling } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeCoupling, instability } from "./analyze.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "coupling",
  name: "Coupling",
  direction: "higher-worse",
  grain: "structure",
  analyze: analyzeCoupling,
  diff: diffComplexity,
};
