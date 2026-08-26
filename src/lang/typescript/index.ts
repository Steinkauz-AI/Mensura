import type { LanguageBackend } from "../types.js";
import { analyzeFunctionScores } from "./source/index.js";
import { buildImportGraph } from "./graph/index.js";
import { listSourceFiles, SKIP_DIRS, toPosix, scriptKindFor } from "./source/walk.js";
import { isFunctionLike, unitName, unitsInFile } from "./source/units.js";
import { diffComplexity } from "./source/diff.js";

export const typescriptBackend: LanguageBackend = {
  id: "typescript",
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
};

export {
  analyzeFunctionScores,
  buildImportGraph,
  listSourceFiles,
  SKIP_DIRS,
  toPosix,
  scriptKindFor,
  isFunctionLike,
  unitName,
  unitsInFile,
  diffComplexity,
};

export type { LanguageBackend };
