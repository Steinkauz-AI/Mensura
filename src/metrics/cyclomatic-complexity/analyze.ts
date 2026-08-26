import { analyzeFunctionScores } from "../../lang/typescript/source/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";
import { complexityOf } from "../../lang/typescript/scoring/cyclomatic.js";


export async function analyzeComplexity(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  return analyzeFunctionScores(root, complexityOf, options);
}
