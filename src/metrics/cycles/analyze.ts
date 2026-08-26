import { buildImportGraph, cycleSizeByPath, fileReport, fileUnit } from "../../lang/typescript/graph/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";


export async function analyzeCycles(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  const graph = await buildImportGraph(root, options);
  const sizes = cycleSizeByPath(graph);
  const units = graph.nodes.map((node) => fileUnit(node.path, sizes.get(node.path) ?? 0));
  return fileReport(units, graph.unparsed);
}
