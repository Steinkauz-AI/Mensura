import type { ImportGraph } from "./types.js";


export function stronglyConnectedComponents(graph: ImportGraph): string[][] {
  const nodes = graph.nodes.map((node) => node.path);
  const indexOf = new Map(nodes.map((path, i) => [path, i]));
  const adj: number[][] = nodes.map(() => []);
  for (const edge of graph.edges) {
    const from = indexOf.get(edge.from);
    const to = indexOf.get(edge.to);
    if (from === undefined || to === undefined) continue;
    adj[from]!.push(to);
  }
  let index = 0;
  const stack: number[] = [];
  const onStack = new Array<boolean>(nodes.length).fill(false);
  const indices = new Array<number>(nodes.length).fill(-1);
  const low = new Array<number>(nodes.length).fill(0);
  const components: string[][] = [];

  const strongconnect = (v: number): void => {
    indices[v] = index;
    low[v] = index;
    index += 1;
    stack.push(v);
    onStack[v] = true;
    for (const w of adj[v]!) {
      if (indices[w] === -1) {
        strongconnect(w);
        low[v] = Math.min(low[v]!, low[w]!);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v]!, indices[w]!);
      }
    }
    if (low[v] === indices[v]) {
      const component: string[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack[w] = false;
        component.push(nodes[w]!);
        if (w === v) break;
      }
      component.sort((a, b) => a.localeCompare(b));
      components.push(component);
    }
  };

  for (let v = 0; v < nodes.length; v++) {
    if (indices[v] === -1) strongconnect(v);
  }
  components.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
  return components;
}

export function cycleSizeByPath(graph: ImportGraph): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const component of stronglyConnectedComponents(graph)) {
    const size = component.length > 1 ? component.length : 0;
    for (const path of component) sizes.set(path, size);
  }
  return sizes;
}
