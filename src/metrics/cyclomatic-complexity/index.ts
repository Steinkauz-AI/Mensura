import { analyzeComplexity } from "./analyze.js";
import { diffComplexity } from "../../lang/typescript/source/diff.js";
import type { MetricDefinition } from "../../core/registry.js";
import type { ComplexityReport } from "../../lang/typescript/source/types.js";
import type { ComplexityDiff } from "../../lang/typescript/source/diff.js";

export { analyzeComplexity } from "./analyze.js";
export type {
  ComplexityReport,
  ComplexityUnit,
  ComplexityUnitKind,
  FileComplexity,
  UnparsedFile,
} from "./types.js";

export const metric: MetricDefinition<ComplexityReport, ComplexityDiff> = {
  id: "cyclomatic-complexity",
  name: "Cyclomatic complexity",
  direction: "higher-worse",
  grain: "function",
  analyze: analyzeComplexity,
  diff: diffComplexity,
};
