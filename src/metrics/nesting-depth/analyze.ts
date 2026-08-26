import { analyzeFunctionScores } from "../../lang/typescript/source/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";
import { nestingOf } from "../../lang/typescript/scoring/nesting.js";


export async function analyzeNestingDepth(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  return analyzeFunctionScores(root, nestingOf, options);
}
