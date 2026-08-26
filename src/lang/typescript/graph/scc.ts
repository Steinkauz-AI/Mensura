import type { ImportGraph } from "./types.js";

type SccState = {
  nodes: string[];
  adj: number[][];
  index: number;
  stack: number[];
  onStack: boolean[];
  indices: number[];
  low: number[];
  components: string[][];
};

export function stronglyConnectedComponents(graph: ImportGraph): string[][] {
  const nodes = graph.nodes.map((node) => node.path);
  const indexOf = new Map(nodes.map((path, i) => [path, i]));
  const adj = buildAdjacency(graph, indexOf, nodes.length);
  const state: SccState = {
    nodes,
    adj,
    index: 0,
    stack: [],
    onStack: new Array<boolean>(nodes.length).fill(false),
    indices: new Array<number>(nodes.length).fill(-1),
    low: new Array<number>(nodes.length).fill(0),
    components: [],
  };

  for (let v = 0; v < nodes.length; v++) {
    if (state.indices[v] === -1) strongconnect(state, v);
  }
  state.components.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
  return state.components;
}

function buildAdjacency(
  graph: ImportGraph,
  indexOf: Map<string, number>,
  nodeCount: number,
): number[][] {
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  for (const edge of graph.edges) {
    const from = indexOf.get(edge.from);
    const to = indexOf.get(edge.to);
    if (from === undefined || to === undefined) continue;
    adj[from]!.push(to);
  }
  return adj;
}

function strongconnect(state: SccState, v: number): void {
  beginVisit(state, v);
  for (const w of state.adj[v]!) visitNeighbor(state, v, w);
  if (state.low[v] === state.indices[v]) finishComponent(state, v);
}

function beginVisit(state: SccState, v: number): void {
  state.indices[v] = state.index;
  state.low[v] = state.index;
  state.index += 1;
  state.stack.push(v);
  state.onStack[v] = true;
}

function visitNeighbor(state: SccState, v: number, w: number): void {
  if (state.indices[w] === -1) {
    strongconnect(state, w);
    state.low[v] = Math.min(state.low[v]!, state.low[w]!);
    return;
  }
  if (state.onStack[w]) {
    state.low[v] = Math.min(state.low[v]!, state.indices[w]!);
  }
}

function finishComponent(state: SccState, v: number): void {
  const component: string[] = [];
  while (true) {
    const w = state.stack.pop()!;
    state.onStack[w] = false;
    component.push(state.nodes[w]!);
    if (w === v) break;
  }
  component.sort((a, b) => a.localeCompare(b));
  state.components.push(component);
}

export function cycleSizeByPath(graph: ImportGraph): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const component of stronglyConnectedComponents(graph)) {
    const size = component.length > 1 ? component.length : 0;
    for (const path of component) sizes.set(path, size);
  }
  return sizes;
}
