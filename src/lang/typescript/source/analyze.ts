import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { buildGrainPathSkipper, loadMensuraConfig } from "../../../core/config/index.js";
import { unitsInFile, type UnitScore } from "./units.js";
import { listSourceFiles, scriptKindFor, SKIP_DIRS, toPosix } from "./walk.js";
import type { ComplexityReport, ComplexityUnit, FileComplexity } from "./types.js";


export async function analyzeFunctionScores(
  root: string,
  score: UnitScore,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  const include = options?.include?.map(toPosix);
  const config = await loadMensuraConfig(root);
  const skipDirs = new Set([...SKIP_DIRS, ...config.skipDirectories]);
  const skipPath = buildGrainPathSkipper(config.skipPaths, "function");
  const files = (await listSourceFiles(root, include, skipDirs)).filter(
    (abs) => !skipPath(toPosix(relative(root, abs))),
  );
  const { units, unparsed } = await scoreFiles(files, root, score);
  unparsed.sort((a, b) => a.path.localeCompare(b.path));
  return { units, files: rollup(units), unparsed };
}

async function scoreFiles(
  files: string[],
  root: string,
  score: UnitScore,
): Promise<Pick<ComplexityReport, "units" | "unparsed">> {
  const units: ComplexityUnit[] = [];
  const unparsed: ComplexityReport["unparsed"] = [];
  for (const abs of files) {
    const path = toPosix(relative(root, abs));
    const text = await readFile(abs, "utf8");
    const parsed = unitsInFile(path, text, scriptKindFor(path), score);
    units.push(...parsed.units);
    if (parsed.parseErrorCount > 0) {
      unparsed.push({ path, errorCount: parsed.parseErrorCount });
    }
  }
  return { units, unparsed };
}

function rollup(units: ComplexityUnit[]): FileComplexity[] {
  const byPath = new Map<string, FileComplexity>();
  for (const unit of units) {
    const existing = byPath.get(unit.path);
    if (!existing) {
      byPath.set(unit.path, {
        path: unit.path,
        functionCount: 1,
        minComplexity: unit.complexity,
        maxComplexity: unit.complexity,
        sumComplexity: unit.complexity,
      });
      continue;
    }
    existing.functionCount += 1;
    existing.sumComplexity += unit.complexity;
    if (unit.complexity > existing.maxComplexity) {
      existing.maxComplexity = unit.complexity;
    }
    if (unit.complexity < existing.minComplexity) {
      existing.minComplexity = unit.complexity;
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
