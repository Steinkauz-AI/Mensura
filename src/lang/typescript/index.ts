export { typescriptBackend } from "./backend.js";
export { analyzeFunctionScores } from "./source/index.js";
export { buildImportGraph } from "./graph/index.js";
export { listSourceFiles, SKIP_DIRS, toPosix, scriptKindFor } from "./source/walk.js";
export { isFunctionLike, unitName, unitsInFile } from "./source/units.js";
export { diffComplexity } from "./source/diff.js";
export { isTestSourcePath } from "./source/test-path.js";
export type { LanguageBackend } from "../types.js";
