import { analyzeFunctionScores } from "../../lang/typescript/source/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";
import { maintainabilityOf } from "../../lang/typescript/scoring/maintainability.js";


export async function analyzeMaintainability(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  return analyzeFunctionScores(
    root,
    (fn) => {
      const measures = maintainabilityOf(fn);
      return {
        complexity: measures.index,
        volume: measures.volume,
        cyclomatic: measures.cyclomatic,
        loc: measures.loc,
      };
    },
    options,
  );
}
