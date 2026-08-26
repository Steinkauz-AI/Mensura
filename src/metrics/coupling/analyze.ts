import { buildImportGraph, fileReport, fileUnit } from "../../lang/typescript/graph/index.js";
import type { ComplexityReport } from "../../lang/typescript/source/index.js";


export async function analyzeCoupling(
  root: string,
  options?: { include?: string[] },
): Promise<ComplexityReport> {
  const graph = await buildImportGraph(root, options);
  const ca = new Map<string, Set<string>>();
  const ce = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    ca.set(node.path, new Set());
    ce.set(node.path, new Set());
  }
  for (const edge of graph.edges) {
    ce.get(edge.from)?.add(edge.to);
    ca.get(edge.to)?.add(edge.from);
  }
  const units = graph.nodes.map((node) => {
    const afferent = ca.get(node.path)?.size ?? 0;
    const efferent = ce.get(node.path)?.size ?? 0;
    return fileUnit(node.path, efferent, {
      ca: afferent,
      ce: efferent,
      instability: instability(afferent, efferent),
    });
  });
  return fileReport(units, graph.unparsed);
}

export function instability(ca: number, ce: number): number {
  const den = ca + ce;
  if (den === 0) return 0;
  return Math.round((ce / den) * 100) / 100;
}
