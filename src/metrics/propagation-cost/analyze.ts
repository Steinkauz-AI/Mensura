import { buildImportGraph, fileReport, fileUnit, visibilityOf } from "../../lang/typescript/graph/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";


export async function analyzePropagationCost(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  const graph = await buildImportGraph(root, options);
  const visibility = visibilityOf(graph);
  const units = graph.nodes.map((node) =>
    fileUnit(node.path, visibility.byPath.get(node.path) ?? 0),
  );
  return fileReport(units, graph.unparsed, visibility.cost);
}
