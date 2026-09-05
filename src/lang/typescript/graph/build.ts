import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";
import { buildGrainPathSkipper, loadMensuraConfig } from "../../../core/config/index.js";
import { isTestSourcePath } from "../source/test-path.js";
import { listSourceFiles, scriptKindFor, SKIP_DIRS, toPosix } from "../source/walk.js";
import { loadWorkspacePackages, packageDirOf } from "./packages.js";
import { resolveSpecifier } from "./resolve.js";
import { createAliasResolver, type AliasResolver } from "./aliases.js";
import { specifiersInFile } from "./specifiers.js";
import type { ImportEdge, ImportGraph, ImportNode } from "./types.js";

export type GraphOptions = {
  include?: string[];
};


export async function buildImportGraph(
  root: string,
  options?: GraphOptions,
): Promise<ImportGraph> {
  const production = await listProductionSources(root, options?.include);
  const fileSet = new Set(production.paths);
  const packages = await loadWorkspacePackages(root, production.paths, fileSet);
  const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg.dir]));
  const packageExports = new Map(packages.map((pkg) => [pkg.name, pkg.exports]));
  const nodes: ImportNode[] = production.paths.map((path) => ({
    path,
    packageDir: packageDirOf(path, packages),
  }));
  const { edges, unparsed } = await collectEdges(
    root,
    production.paths,
    production.absByPath,
    fileSet,
    packagesByName,
    packageExports,
  );
  edges.sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind),
  );
  unparsed.sort((a, b) => a.path.localeCompare(b.path));
  return { nodes, edges, packages, unparsed };
}

async function listProductionSources(
  root: string,
  includeRaw: string[] | undefined,
): Promise<{ paths: string[]; absByPath: Map<string, string> }> {
  const include = includeRaw?.map(toPosix);
  const config = await loadMensuraConfig(root);
  const skipDirs = new Set([...SKIP_DIRS, ...config.skipDirectories]);
  const skipPath = buildGrainPathSkipper(config.skipPaths, "structure");
  const absFiles = (await listSourceFiles(root, include, skipDirs)).filter(
    (abs) => !skipPath(toPosix(relative(root, abs))),
  );
  const paths: string[] = [];
  const absByPath = new Map<string, string>();
  for (const abs of absFiles) {
    const path = toPosix(relative(root, abs));
    if (isTestSourcePath(path)) continue;
    paths.push(path);
    absByPath.set(path, abs);
  }
  paths.sort();
  return { paths, absByPath };
}

async function collectEdges(
  root: string,
  paths: readonly string[],
  absByPath: Map<string, string>,
  fileSet: ReadonlySet<string>,
  packagesByName: ReadonlyMap<string, string>,
  packageExports: ReadonlyMap<string, unknown>,
): Promise<{ edges: ImportEdge[]; unparsed: ImportGraph["unparsed"] }> {
  const edgeKey = new Set<string>();
  const edges: ImportEdge[] = [];
  const unparsed: ImportGraph["unparsed"] = [];
  const resolveAlias = createAliasResolver(root, fileSet);
  for (const path of paths) {
    await collectFileEdges(
      root,
      path,
      absByPath,
      fileSet,
      packagesByName,
      packageExports,
      resolveAlias,
      edgeKey,
      edges,
      unparsed,
    );
  }
  return { edges, unparsed };
}

async function collectFileEdges(
  root: string,
  path: string,
  absByPath: Map<string, string>,
  fileSet: ReadonlySet<string>,
  packagesByName: ReadonlyMap<string, string>,
  packageExports: ReadonlyMap<string, unknown>,
  resolveAlias: AliasResolver,
  edgeKey: Set<string>,
  edges: ImportEdge[],
  unparsed: ImportGraph["unparsed"],
): Promise<void> {
  const abs = absByPath.get(path) ?? join(root, path);
  const text = await readFile(abs, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKindFor(path));
  const parseErrorCount =
    (source as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length ?? 0;
  if (parseErrorCount > 0) unparsed.push({ path, errorCount: parseErrorCount });
  for (const spec of specifiersInFile(source)) {
    addEdge(path, spec.specifier, spec.typeOnly, fileSet, packagesByName, packageExports, resolveAlias, edgeKey, edges);
  }
}

function addEdge(
  from: string,
  specifier: string,
  typeOnly: boolean,
  fileSet: ReadonlySet<string>,
  packagesByName: ReadonlyMap<string, string>,
  packageExports: ReadonlyMap<string, unknown>,
  resolveAlias: AliasResolver,
  edgeKey: Set<string>,
  edges: ImportEdge[],
): void {
  const to = resolveAlias(from, specifier)
    ?? resolveSpecifier(from, specifier, fileSet, packagesByName, packageExports);
  if (!to || to === from) return;
  const kind = typeOnly ? "type" : "value";
  const key = `${from}\0${to}\0${kind}`;
  if (edgeKey.has(key)) return;
  edgeKey.add(key);
  edges.push({ from, to, kind });
}
