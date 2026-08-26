import { analyzeFunctionScores } from "../../lang/typescript/source/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";
import { halsteadOf } from "../../lang/typescript/scoring/halstead-score.js";


export async function analyzeHalstead(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  return analyzeFunctionScores(
    root,
    (fn) => {
      const measures = halsteadOf(fn);
      return {
        complexity: measures.volume,
        difficulty: measures.difficulty,
        effort: measures.effort,
      };
    },
    options,
  );
}
