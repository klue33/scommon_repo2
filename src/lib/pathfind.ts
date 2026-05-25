export type GraphNodeType =
  | "kiosk"
  | "store"
  | "junction"
  | "exit"
  | "entrance-main"
  | "entrance-tenant";

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  type: GraphNodeType;
  /** For type==="store", links back to stores.json by store id. */
  store?: string;
  /** For type==="kiosk", a human label shown in the From picker. */
  label?: string;
}

export interface GraphEdge {
  a: string;
  b: string;
  cost: number;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  adj: Map<string, GraphEdge[]>;
}

export interface RouteResult {
  path: string[];
  cost: number;
  points: Array<[number, number]>;
}

export function buildGraph(spec: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}): Graph {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, GraphEdge[]>();
  const push = (id: string, e: GraphEdge) => {
    const list = adj.get(id) ?? [];
    list.push(e);
    adj.set(id, list);
  };
  for (const n of spec.nodes) nodes.set(n.id, n);
  for (const e of spec.edges) {
    push(e.a, e);
    push(e.b, { ...e, a: e.b, b: e.a });
  }
  return { nodes, adj };
}

/** A* with Euclidean heuristic on a single-plane graph (SCC is one level). */
export function route(graph: Graph, start: string, goal: string): RouteResult | null {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) return null;
  const goalNode = graph.nodes.get(goal)!;
  const h = (id: string): number => {
    const n = graph.nodes.get(id)!;
    return Math.hypot(n.x - goalNode.x, n.y - goalNode.y);
  };

  const open = new Set<string>([start]);
  const came = new Map<string, string>();
  const g = new Map<string, number>([[start, 0]]);
  const f = new Map<string, number>([[start, h(start)]]);

  while (open.size > 0) {
    let cur: string | null = null;
    let curF = Infinity;
    for (const id of open) {
      const fv = f.get(id) ?? Infinity;
      if (fv < curF) { curF = fv; cur = id; }
    }
    if (cur === null) break;
    if (cur === goal) return reconstruct(graph, came, cur);
    open.delete(cur);

    for (const e of graph.adj.get(cur) ?? []) {
      const tentative = (g.get(cur) ?? Infinity) + e.cost;
      if (tentative < (g.get(e.b) ?? Infinity)) {
        came.set(e.b, cur);
        g.set(e.b, tentative);
        f.set(e.b, tentative + h(e.b));
        open.add(e.b);
      }
    }
  }
  return null;
}

/**
 * Tenant→tenant routing: same A* result as `route`, but trims any
 * store-centroid nodes off the start and end of the path. Store
 * centroids sit INSIDE the tenant polygon — they're selection
 * anchors, not waypoints. The rendered polyline should terminate
 * at the entrance-tenant adjacent to each store, not inside the
 * unit. See tests/pathfind.test.ts.
 *
 * Returns null if the trimmed path is shorter than 2 nodes (i.e.
 * after trimming there's no real route to draw).
 */
export function routeBetweenStores(
  graph: Graph, start: string, goal: string,
): RouteResult | null {
  if (start === goal) return null;
  const r = route(graph, start, goal);
  if (!r) return null;
  return trimStoreEndpoints(graph, r);
}

function trimStoreEndpoints(graph: Graph, r: RouteResult): RouteResult | null {
  const path = [...r.path];
  const points: Array<[number, number]> = [...r.points];
  while (path.length > 0 && graph.nodes.get(path[0])?.type === "store") {
    path.shift();
    points.shift();
  }
  while (
    path.length > 0 &&
    graph.nodes.get(path[path.length - 1])?.type === "store"
  ) {
    path.pop();
    points.pop();
  }
  if (path.length < 2) return null;
  // Re-compute cost from the trimmed adjacency walk.
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const prev = graph.nodes.get(path[i - 1])!;
    const n = graph.nodes.get(path[i])!;
    const edge = (graph.adj.get(prev.id) ?? []).find((e) => e.b === n.id);
    if (edge) cost += edge.cost;
  }
  return { path, cost, points };
}

function reconstruct(graph: Graph, came: Map<string, string>, end: string): RouteResult {
  const path: string[] = [end];
  let cur = end;
  while (came.has(cur)) {
    cur = came.get(cur)!;
    path.unshift(cur);
  }
  const points: Array<[number, number]> = [];
  let cost = 0;
  for (let i = 0; i < path.length; i++) {
    const n = graph.nodes.get(path[i])!;
    points.push([n.x, n.y]);
    if (i > 0) {
      const prev = graph.nodes.get(path[i - 1])!;
      const edge = (graph.adj.get(prev.id) ?? []).find((e) => e.b === n.id);
      if (edge) cost += edge.cost;
    }
  }
  return { path, cost, points };
}
