export type Mode = "walk" | "stair" | "escalator" | "elevator";

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  type: "kiosk" | "store" | "junction" | "stair" | "escalator" | "elevator" | "exit";
  store?: string;
  floor: number;
}

export interface GraphEdge {
  a: string;
  b: string;
  cost: number;
  mode: Mode;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  adj: Map<string, GraphEdge[]>;
}

export interface RouteOptions {
  /** When true, edges with mode "stair" or "escalator" are skipped. */
  accessible?: boolean;
}

export interface RouteResult {
  path: string[];           // node ids in order
  cost: number;
  /** Segments grouped by floor, each a polyline of (x,y) pairs. */
  segments: Array<{ floor: number; points: Array<[number, number]> }>;
}

export function buildGraph(
  floors: Array<{
    floor: number;
    nodes: Omit<GraphNode, "floor">[];
    edges: GraphEdge[];
    vertical?: { from: string; to: string; cost: number; mode: Mode }[];
  }>,
): Graph {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, GraphEdge[]>();
  const push = (id: string, e: GraphEdge) => {
    const list = adj.get(id) ?? [];
    list.push(e);
    adj.set(id, list);
  };
  for (const f of floors) {
    for (const n of f.nodes) nodes.set(n.id, { ...n, floor: f.floor });
    for (const e of f.edges) {
      push(e.a, e);
      push(e.b, { ...e, a: e.b, b: e.a });
    }
    for (const v of f.vertical ?? []) {
      const e: GraphEdge = { a: v.from, b: v.to, cost: v.cost, mode: v.mode };
      push(v.from, e);
      push(v.to, { ...e, a: v.to, b: v.from });
    }
  }
  return { nodes, adj };
}

/** A* with an admissible Euclidean (per-floor) + floor-change penalty heuristic. */
export function route(
  graph: Graph,
  start: string,
  goal: string,
  opts: RouteOptions = {},
): RouteResult | null {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) return null;
  const goalNode = graph.nodes.get(goal)!;

  const h = (id: string): number => {
    const n = graph.nodes.get(id)!;
    const sameFloor = n.floor === goalNode.floor;
    const dx = n.x - goalNode.x;
    const dy = n.y - goalNode.y;
    const euclid = Math.hypot(dx, dy);
    return sameFloor ? euclid : euclid + 200; // 200 ~ cheapest vertical cost
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
      if (opts.accessible && (e.mode === "stair" || e.mode === "escalator")) continue;
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

function reconstruct(graph: Graph, came: Map<string, string>, end: string): RouteResult {
  const path: string[] = [end];
  let cur = end;
  while (came.has(cur)) {
    cur = came.get(cur)!;
    path.unshift(cur);
  }
  const segments: RouteResult["segments"] = [];
  let cost = 0;
  for (let i = 0; i < path.length; i++) {
    const n = graph.nodes.get(path[i])!;
    if (i > 0) {
      const prev = graph.nodes.get(path[i - 1])!;
      const edge = (graph.adj.get(prev.id) ?? []).find((e) => e.b === n.id);
      if (edge) cost += edge.cost;
    }
    const last = segments[segments.length - 1];
    if (!last || last.floor !== n.floor) {
      segments.push({ floor: n.floor, points: [[n.x, n.y]] });
    } else {
      last.points.push([n.x, n.y]);
    }
  }
  return { path, cost, segments };
}
