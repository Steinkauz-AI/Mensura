import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";
import { buildGrainPathSkipper, loadMensuraConfig } from "../../../core/config/index.js";
import { isTestSourcePath } from "../../../metrics/test-coverage/test-files.js";
import { listSourceFiles, scriptKindFor, SKIP_DIRS, toPosix } from "../source/walk.js";
import { loadWorkspacePackages, packageDirOf } from "./packages.js";
import { resolveSpecifier } from "./resolve.js";
import { specifiersInFile } from "./specifiers.js";
import type { ImportEdge, ImportGraph, ImportNode } from "./types.js";

export type GraphOptions = {
  include?: string[];
};


export async function buildImportGraph(
  root: string,
  options?: GraphOptions,
): Promise<ImportGraph> {
  const include = options?.include?.map(toPosix);
  const config = await loadMensuraConfig(root);
  const skipDirs = new Set([...SKIP_DIRS, ...config.skipDirectories]);
  const skipPath = buildGrainPathSkipper(config.skipPaths, "structure");
  const absFiles = (await listSourceFiles(root, include, skipDirs)).filter(
    (abs) => !skipPath(toPosix(relative(root, abs))),
  );
  const production: string[] = [];
  const absByPath = new Map<string, string>();
  const fileSet = new Set<string>();
  for (const abs of absFiles) {
    const path = toPosix(relative(root, abs));
    if (isTestSourcePath(path)) continue;
    production.push(path);
    fileSet.add(path);
    absByPath.set(path, abs);
  }
  production.sort();
  const packages = await loadWorkspacePackages(root, production, fileSet);
  const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg.dir]));
  const nodes: ImportNode[] = production.map((path) => ({
    path,
    packageDir: packageDirOf(path, packages),
  }));
  const edgeKey = new Set<string>();
  const edges: ImportEdge[] = [];
  const unparsed: ImportGraph["unparsed"] = [];
  for (const path of production) {
    const abs = absByPath.get(path) ?? join(root, path);
    const text = await readFile(abs, "utf8");
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKindFor(path));
    const parseErrorCount =
      (source as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length ?? 0;
    if (parseErrorCount > 0) unparsed.push({ path, errorCount: parseErrorCount });
    for (const spec of specifiersInFile(source)) {
      const to = resolveSpecifier(path, spec.specifier, fileSet, packagesByName);
      if (!to || to === path) continue;
      const kind = spec.typeOnly ? "type" : "value";
      const key = `${path}\0${to}\0${kind}`;
      if (edgeKey.has(key)) continue;
      edgeKey.add(key);
      edges.push({ from: path, to, kind });
    }
  }
  edges.sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind),
  );
  unparsed.sort((a, b) => a.path.localeCompare(b.path));
  return { nodes, edges, packages, unparsed };
}
