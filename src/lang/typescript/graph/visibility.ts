import type { ImportGraph } from "./types.js";

export type Visibility = {
  
  cost: number;
  
  byPath: Map<string, number>;
};


export function visibilityOf(graph: ImportGraph): Visibility {
  const nodes = graph.nodes.map((node) => node.path);
  const n = nodes.length;
  const byPath = new Map<string, number>();
  if (n === 0) return { cost: 0, byPath };
  if (n === 1) {
    byPath.set(nodes[0]!, 0);
    return { cost: 0, byPath };
  }
  const adj = adjacencyOf(graph, nodes);
  let pairs = 0;
  for (const start of nodes) {
    const reachable = reachableCount(start, adj) - 1;
    pairs += reachable;
    byPath.set(start, percent(reachable, n - 1));
  }
  return { cost: percent(pairs, n * (n - 1)), byPath };
}

function adjacencyOf(graph: ImportGraph, nodes: string[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const path of nodes) adj.set(path, []);
  for (const edge of graph.edges) {
    adj.get(edge.from)?.push(edge.to);
  }
  return adj;
}

function reachableCount(start: string, adj: Map<string, string[]>): number {
  const seen = new Set<string>();
  const queue = [start];
  seen.add(start);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size;
}

function percent(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 100);
}
