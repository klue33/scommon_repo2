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

/**
 * Operator-drawn line segment that the wayfinder must not cross.
 * Any graph edge whose segment intersects a barrier is dropped at
 * `buildGraph` time, forcing A* to find a detour.
 */
export interface Barrier {
  id: string;
  a: [number, number];
  b: [number, number];
}

/**
 * A tenant footprint. Any edge that enters a polygon NOT owned by
 * either of its endpoints is dropped at `buildGraph` time — visitors
 * should never be routed through another tenant's space (it's
 * physically a wall).
 */
export interface RoutePolygon {
  store_id: string;
  ring: number[][];
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
  barriers?: Barrier[];
  polygons?: RoutePolygon[];
}): Graph {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, GraphEdge[]>();
  const push = (id: string, e: GraphEdge) => {
    const list = adj.get(id) ?? [];
    list.push(e);
    adj.set(id, list);
  };
  for (const n of spec.nodes) nodes.set(n.id, n);
  const barriers = spec.barriers ?? [];
  const polygons = spec.polygons ?? [];
  for (const e of spec.edges) {
    const na = nodes.get(e.a);
    const nb = nodes.get(e.b);
    if (!na || !nb) continue;
    // Centroid-to-centroid edges between two different stores are
    // wall-crossings by construction (the segment goes from inside
    // one polygon to inside another). Autoconnect sometimes adds
    // them as fallback bridges; pathfind refuses to use them.
    if (na.type === "store" && nb.type === "store" && na.store !== nb.store) continue;
    // From a store node, only edges to entrance-* are legitimate.
    // A `store ↔ junction` autoconnect bridge exits the polygon at
    // a random point on the wall — that's not how you enter a
    // standalone "island" tenant (BMO, TD, Rogers, etc.). Doors
    // only.
    if (isStoreSideExit(na, nb) || isStoreSideExit(nb, na)) continue;
    if (barriers.some((bar) =>
      segmentsCross([na.x, na.y], [nb.x, nb.y], bar.a, bar.b)
    )) continue;
    if (edgeCrossesForeignPolygon(na, nb, polygons)) continue;
    push(e.a, e);
    push(e.b, { ...e, a: e.b, b: e.a });
  }
  return { nodes, adj };
}

/**
 * Returns true if `from` is a store node and `to` is anything other
 * than an entrance-* node or a kiosk. Centroid ↔ door (or kiosk,
 * which is itself a publicly-accessible service point) is the only
 * valid way out of a tenant polygon; centroid ↔ junction means
 * cutting through a wall.
 */
function isStoreSideExit(from: GraphNode, to: GraphNode): boolean {
  if (from.type !== "store") return false;
  return to.type !== "entrance-tenant"
      && to.type !== "entrance-main"
      && to.type !== "kiosk";
}

function edgeCrossesForeignPolygon(
  na: GraphNode, nb: GraphNode, polygons: RoutePolygon[],
): boolean {
  if (polygons.length === 0) return false;
  const ap: [number, number] = [na.x, na.y];
  const bp: [number, number] = [nb.x, nb.y];
  for (const p of polygons) {
    // An edge is allowed to cross a polygon it "owns" — the store
    // centroid → entrance leg by design crosses the store's
    // polygon boundary. Two ways to be the owner:
    //   1. Endpoint is the store centroid for this polygon.
    //   2. Endpoint sits inside the polygon (e.g. entrance-tenant
    //      nodes are placed AT each tenant's door).
    const aOwns = ownsPolygon(na, p, ap);
    const bOwns = ownsPolygon(nb, p, bp);
    if (aOwns || bOwns) continue;
    if (segmentEntersRing(ap, bp, p.ring)) return true;
  }
  return false;
}

function ownsPolygon(
  n: GraphNode, p: RoutePolygon, pt: [number, number],
): boolean {
  if (n.type === "store" && n.store === p.store_id) return true;
  return pointInRing(pt, p.ring);
}

function pointInRing(p: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > p[1]) !== (yj > p[1])) &&
      (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentEntersRing(
  a: [number, number], b: [number, number], ring: number[][],
): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p1: [number, number] = [ring[i][0], ring[i][1]];
    const p2: [number, number] = [ring[j][0], ring[j][1]];
    if (segmentsCross(a, b, p1, p2)) return true;
  }
  // Fully contained segment (no boundary crossing but interior).
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > mid[1]) !== (yj > mid[1])) &&
      (mid[0] < ((xj - xi) * (mid[1] - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsCross(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number],
): boolean {
  const o = (a: [number, number], b: [number, number], c: [number, number]) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const o1 = o(p1, p2, p3), o2 = o(p1, p2, p4);
  const o3 = o(p3, p4, p1), o4 = o(p3, p4, p2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

export interface RouteOpts {
  /** Skip nodes of these types entirely (except the start/goal
   *  themselves). Used by routeBetweenStores to keep tenant→tenant
   *  routes from stepping outside via entrance-main nodes. */
  forbidTypes?: ReadonlySet<string>;
}

/** A* with Euclidean heuristic on a single-plane graph (SCC is one level). */
export function route(
  graph: Graph, start: string, goal: string, opts: RouteOpts = {},
): RouteResult | null {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) return null;
  const goalNode = graph.nodes.get(goal)!;
  const forbid = opts.forbidTypes;
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
      // Skip forbidden node types unless it's the goal itself
      // (which the caller is intentionally asking us to reach).
      if (forbid && e.b !== goal) {
        const nbType = graph.nodes.get(e.b)?.type;
        if (nbType && forbid.has(nbType)) continue;
      }
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
  // Redirect each store endpoint to its operator-placed entrance-
  // tenant neighbor when one exists. This guarantees the route
  // approaches the store from the correct side, instead of taking
  // a cheaper autoconnect-bridge that lands at the back of the
  // unit. Stores without an entrance-tenant fall back to the
  // store node itself + trim-on-exit.
  const startEntry = entranceFor(graph, start) ?? start;
  const goalEntry  = entranceFor(graph, goal)  ?? goal;
  if (startEntry === goalEntry) return null;
  // Wall rule: transit through any tenant centroid means stepping
  // inside that tenant's space ("over a wall"). Indoor rule: a
  // visitor already at a tenant entrance shouldn't be routed out a
  // main entrance and back in. Both are preferences — fall back if
  // no clean route exists.
  const STRICT_FORBID: ReadonlySet<string> = new Set(["entrance-main", "store"]);
  const SOFT_FORBID: ReadonlySet<string> = new Set(["entrance-main"]);
  let r = route(graph, startEntry, goalEntry, { forbidTypes: STRICT_FORBID });
  if (!r) r = route(graph, startEntry, goalEntry, { forbidTypes: SOFT_FORBID });
  if (!r) r = route(graph, startEntry, goalEntry);
  if (!r) return null;
  return trimStoreEndpoints(graph, r);
}

/**
 * For a store node, return the id of its nearest entrance-tenant
 * neighbor (by edge cost). Returns null if the node isn't a store
 * or has no entrance-tenant neighbor. The entrance-tenant is the
 * operator-placed marker on the polygon's actual door side — see
 * tests/pathfind.test.ts ("prefers the entrance-tenant neighbor").
 */
function entranceFor(graph: Graph, storeId: string): string | null {
  const node = graph.nodes.get(storeId);
  if (!node || node.type !== "store") return null;
  const neighbors = graph.adj.get(storeId) ?? [];
  let best: { id: string; cost: number } | null = null;
  for (const e of neighbors) {
    const nb = graph.nodes.get(e.b);
    if (nb?.type !== "entrance-tenant") continue;
    if (!best || e.cost < best.cost) best = { id: e.b, cost: e.cost };
  }
  return best?.id ?? null;
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
