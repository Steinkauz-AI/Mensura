import { buildImportGraph, fileReport, fileUnit } from "../../lang/typescript/graph/index.js";
import type { ImportGraph } from "../../lang/typescript/graph/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";


export async function analyzeEncapsulation(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  const graph = await buildImportGraph(root, options);
  const leaks = leakCountByPath(graph);
  const units = graph.nodes.map((node) => fileUnit(node.path, leaks.get(node.path) ?? 0));
  return fileReport(units, graph.unparsed);
}

export function leakCountByPath(graph: ImportGraph): Map<string, number> {
  const publicOf = new Map(graph.packages.map((pkg) => [pkg.dir, new Set(pkg.publicFiles)]));
  const counts = new Map<string, number>();
  for (const node of graph.nodes) counts.set(node.path, 0);
  const nodeByPath = new Map(graph.nodes.map((node) => [node.path, node]));
  for (const edge of graph.edges) {
    const from = nodeByPath.get(edge.from);
    const to = nodeByPath.get(edge.to);
    if (!from || !to) continue;
    if (from.packageDir === to.packageDir) continue;
    const publicFiles = publicOf.get(to.packageDir);
    if (publicFiles?.has(to.path)) continue;
    counts.set(to.path, (counts.get(to.path) ?? 0) + 1);
  }
  return counts;
}
