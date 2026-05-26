/**
 * autoconnect — merge a multi-component graph into a single
 * connected component by adding the minimum number of bridging
 * edges between geometrically-nearest node pairs.
 *
 * Input:  { nodes: GraphNode[], edges: GraphEdge[] }
 * Output: same shape; original nodes and edges preserved; added
 *         edges marked `auto: true` so the operator can audit
 *         them in the in-app editor.
 *
 * Strategy:
 *   1. Find all connected components.
 *   2. Pick the largest as the "spine."
 *   3. For each non-spine component, find the closest (Euclidean)
 *      node-pair between this component and the spine, and add a
 *      single edge between them. Cost = round(distance).
 *   4. After bridging a component, fold it into the spine so the
 *      next component compares against the growing spine (not the
 *      original).
 *
 * Contract: tests/autoconnect.test.ts.
 */

interface AutoNode {
  id: string;
  x: number;
  y: number;
  type: string;
  store?: string;
  label?: string;
}
interface AutoEdge {
  a: string;
  b: string;
  cost: number;
  auto?: boolean;
}
export interface AutoGraph {
  nodes: AutoNode[];
  edges: AutoEdge[];
}

/** A tenant footprint polygon. `rings` follows GeoJSON Polygon
 *  coordinates: [outer-ring, holes...] where each ring is a closed
 *  loop of [x, y] points. `store_id` lets autoconnect know which
 *  polygon belongs to a store-centroid endpoint (so the
 *  centroid→entrance bridge can legitimately cross it). */
export interface AutoPolygon {
  store_id: string;
  rings: number[][][];
}

export interface AutoBarrier {
  a: [number, number];
  b: [number, number];
}

export interface AutoconnectOpts {
  polygons?: AutoPolygon[];
  /** Operator-drawn line segments. Any candidate bridge that crosses
   *  a barrier is treated the same as a foreign-polygon crossing —
   *  skipped if a clean alternative exists, flagged otherwise. */
  barriers?: AutoBarrier[];
}

function adjacency(g: AutoGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  return adj;
}

function findComponents(g: AutoGraph): string[][] {
  const adj = adjacency(g);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of g.nodes) {
    if (seen.has(n.id)) continue;
    const comp: string[] = [];
    const stack = [n.id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const nx of adj.get(cur) ?? []) stack.push(nx);
    }
    out.push(comp);
  }
  // Sort descending by size so [0] is the spine.
  out.sort((a, b) => b.length - a.length);
  return out;
}

function dist(a: AutoNode, b: AutoNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// ── Polygon-vs-segment geometry ─────────────────────────────────────

/** True if open segment p1-p2 crosses open segment p3-p4 (proper
 *  intersection — touching endpoints doesn't count). Standard
 *  orient-test approach. */
function segmentsCross(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number],
): boolean {
  const o = (a: [number, number], b: [number, number], c: [number, number]) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const o1 = o(p1, p2, p3);
  const o2 = o(p1, p2, p4);
  const o3 = o(p3, p4, p1);
  const o4 = o(p3, p4, p2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** True if point p is strictly inside the polygon (ray-cast). Ignores
 *  holes for simplicity — the SCC polygons are simple. */
function pointInPolygon(p: [number, number], rings: number[][][]): boolean {
  if (rings.length === 0) return false;
  const ring = rings[0];
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

/** True if the segment a-b enters the polygon's interior. Either
 *  the segment crosses any edge of the outer ring, or the midpoint
 *  is inside (covers fully-contained segments). */
function segmentEntersPolygon(
  a: [number, number], b: [number, number],
  poly: AutoPolygon,
): boolean {
  if (poly.rings.length === 0) return false;
  const ring = poly.rings[0];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p1: [number, number] = [ring[i][0], ring[i][1]];
    const p2: [number, number] = [ring[j][0], ring[j][1]];
    if (segmentsCross(a, b, p1, p2)) return true;
  }
  // Fully contained — no boundary crossing but interior hit.
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return pointInPolygon(mid, poly.rings);
}

/**
 * True iff the segment a-b crosses the interior of ANY polygon that
 * is not "owned" by either endpoint (i.e. crossing a store's own
 * polygon is allowed for the centroid→entrance leg). Returns the
 * reason it failed so callers can flag the candidate accordingly.
 */
function bridgeBlockage(
  a: AutoNode, b: AutoNode, polygons: AutoPolygon[], barriers: AutoBarrier[],
): "clean" | "polygon" | "barrier" | "wall" {
  // From a store node, the only legitimate bridge is to an
  // entrance-tenant / entrance-main. A store ↔ junction bridge
  // cuts across the tenant's wall — pathfind drops it anyway, so
  // autoconnect shouldn't pick it as a "clean" option.
  if (
    (a.type === "store" && b.type !== "entrance-tenant" && b.type !== "entrance-main" && b.type !== "kiosk") ||
    (b.type === "store" && a.type !== "entrance-tenant" && a.type !== "entrance-main" && a.type !== "kiosk")
  ) return "wall";
  const ap: [number, number] = [a.x, a.y];
  const bp: [number, number] = [b.x, b.y];
  for (const poly of polygons) {
    // Ownership: store-centroid with matching id, OR endpoint sits
    // inside the polygon (e.g. an entrance-tenant at the door).
    const aOwns = (a.type === "store" && a.store === poly.store_id) ||
      pointInPolygon(ap, poly.rings);
    const bOwns = (b.type === "store" && b.store === poly.store_id) ||
      pointInPolygon(bp, poly.rings);
    if (aOwns || bOwns) continue;
    if (segmentEntersPolygon(ap, bp, poly)) return "polygon";
  }
  for (const bar of barriers) {
    if (segmentsCross(ap, bp, bar.a, bar.b)) return "barrier";
  }
  return "clean";
}

/**
 * For the given source set of node IDs (the component being
 * bridged in), find the closest (source, target) pair against
 * `targetIds`. With polygons provided, candidates whose segment
 * crosses an unrelated polygon are skipped; the next-nearest
 * clean pair wins. If no clean pair exists, fall back to the
 * absolute nearest so the graph still becomes connected (and
 * mark `crossesPolygon: true` on the returned candidate).
 */
function nearestPair(
  byId: Map<string, AutoNode>,
  sourceIds: string[],
  targetIds: string[],
  polygons: AutoPolygon[],
  barriers: AutoBarrier[],
): { source: string; target: string; distance: number; crossesPolygon: boolean; crossesBarrier: boolean } | null {
  if (sourceIds.length === 0 || targetIds.length === 0) return null;
  type Cand = { source: string; target: string; distance: number };
  // Drop wall-crossing candidates upfront (store ↔ non-entrance):
  // they're hard-illegal, never an acceptable fallback.
  const cands: Cand[] = [];
  for (const s of sourceIds) {
    const sn = byId.get(s)!;
    for (const t of targetIds) {
      const tn = byId.get(t)!;
      if (bridgeBlockage(sn, tn, polygons, barriers) === "wall") continue;
      cands.push({ source: s, target: t, distance: dist(sn, tn) });
    }
  }
  cands.sort((a, b) => a.distance - b.distance);
  for (const c of cands) {
    const sn = byId.get(c.source)!;
    const tn = byId.get(c.target)!;
    if (bridgeBlockage(sn, tn, polygons, barriers) === "clean") {
      return { ...c, crossesPolygon: false, crossesBarrier: false };
    }
  }
  // No clean bridge — fall back to the absolute nearest (excluding
  // wall-crossings, which were filtered above). Flag the reason so
  // the operator can see and re-route.
  const fallback = cands[0];
  if (!fallback) return null;
  const sn = byId.get(fallback.source)!;
  const tn = byId.get(fallback.target)!;
  const reason = bridgeBlockage(sn, tn, polygons, barriers);
  return {
    ...fallback,
    crossesPolygon: reason === "polygon",
    crossesBarrier: reason === "barrier",
  };
}

export function autoconnect(graph: AutoGraph, opts?: AutoconnectOpts): AutoGraph {
  // Already connected (or empty / single node)? Return as-is.
  const comps = findComponents(graph);
  if (comps.length <= 1) return { nodes: [...graph.nodes], edges: [...graph.edges] };

  const polygons = opts?.polygons ?? [];
  const barriers = opts?.barriers ?? [];

  const byId = new Map<string, AutoNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  // Start with the largest component as the spine and grow it.
  const spine = new Set(comps[0]);
  const newEdges: AutoEdge[] = [];

  for (let i = 1; i < comps.length; i++) {
    const comp = comps[i];
    const best = nearestPair(byId, comp, Array.from(spine), polygons, barriers);
    if (!best) continue; // shouldn't happen
    if (best.source === best.target) continue;
    const edge: AutoEdge = {
      a: best.source,
      b: best.target,
      cost: Math.max(1, Math.round(best.distance)),
      auto: true,
    };
    if (best.crossesPolygon) {
      (edge as any).crossesPolygon = true;
    }
    if (best.crossesBarrier) {
      // Flag visually so the operator can rewire it manually.
      (edge as any).crossesBarrier = true;
    }
    newEdges.push(edge);
    // Fold this component into the spine.
    for (const id of comp) spine.add(id);
  }

  return {
    nodes: [...graph.nodes],
    edges: [...graph.edges, ...newEdges],
  };
}
