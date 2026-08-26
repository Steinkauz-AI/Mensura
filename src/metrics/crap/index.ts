import { analyzeCrap } from "./analyze.js";
import { ensureTestCoverage } from "../test-coverage/ensure.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeCrap } from "./analyze.js";
export type { CrapMeasures } from "./score.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "crap",
  name: "CRAP",
  direction: "higher-worse",
  grain: "function",
  analyze: analyzeCrap,
  diff: diffComplexity,
  prepare: ensureTestCoverage,
};
