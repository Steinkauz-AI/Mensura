import { analyzeFunctionScores } from "../../lang/typescript/source/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";
import { cognitiveOf } from "../../lang/typescript/scoring/cognitive.js";


export async function analyzeCognitiveComplexity(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  return analyzeFunctionScores(root, cognitiveOf, options);
}
