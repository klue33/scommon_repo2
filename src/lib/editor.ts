/**
 * Editor helpers — pure-function utilities used by the `?edit=1`
 * mode in MapViewer. Lives outside the component so it's unit-
 * testable without rendering.
 *
 *  - parseGraphJson(text): validate a user-supplied graph.json file
 *    before swapping it into the editor.
 *  - makeHistory(initial, maxSize?): a tiny undo stack. push()
 *    records the PREVIOUS state; undo() restores it.
 *
 * Contract: tests/editor.test.ts.
 */

interface RawNode {
  id: string;
  x: number;
  y: number;
  type: string;
  store?: string;
  label?: string;
}
interface RawEdge {
  a: string;
  b: string;
  cost?: number;
  auto?: boolean;
  crossesPolygon?: boolean;
}
export interface RawGraph {
  nodes: RawNode[];
  edges: RawEdge[];
  barriers?: Array<{ id: string; a: [number, number]; b: [number, number] }>;
}

type ParseResult =
  | { ok: true; graph: RawGraph }
  | { ok: false; error: string };

function isRawNode(x: any): x is RawNode {
  return (
    x && typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.x === "number" &&
    typeof x.y === "number" &&
    typeof x.type === "string"
  );
}

function isRawEdge(x: any): x is RawEdge {
  return (
    x && typeof x === "object" &&
    typeof x.a === "string" &&
    typeof x.b === "string"
  );
}

export function parseGraphJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err: any) {
    return { ok: false, error: `not valid JSON: ${err?.message ?? err}` };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "JSON must be an object" };
  }
  const obj = data as any;
  if (!Array.isArray(obj.nodes)) return { ok: false, error: "`nodes` must be an array" };
  if (!Array.isArray(obj.edges)) return { ok: false, error: "`edges` must be an array" };

  const ids = new Set<string>();
  for (const n of obj.nodes) {
    if (!isRawNode(n)) {
      return { ok: false, error: `invalid node: ${JSON.stringify(n).slice(0, 80)}` };
    }
    if (ids.has(n.id)) {
      return { ok: false, error: `duplicate node id: ${n.id}` };
    }
    ids.add(n.id);
  }
  for (const e of obj.edges) {
    if (!isRawEdge(e)) {
      return { ok: false, error: `invalid edge: ${JSON.stringify(e).slice(0, 80)}` };
    }
    if (!ids.has(e.a) || !ids.has(e.b)) {
      return { ok: false, error: `edge references unknown node id: ${e.a} ↔ ${e.b}` };
    }
  }
  const barriers = Array.isArray(obj.barriers) ? obj.barriers : undefined;
  return { ok: true, graph: { nodes: obj.nodes, edges: obj.edges, ...(barriers ? { barriers } : {}) } };
}

/**
 * Tiny LIFO undo stack. `current` always reflects the latest pushed
 * state (or initial). `push(next)` records the OLD current into the
 * undo stack and sets the new current. `undo()` pops the top of the
 * stack back into current. `maxSize` caps history depth so memory
 * doesn't grow unbounded during long editor sessions.
 */
export interface History<T> {
  current: T;
  readonly canUndo: boolean;
  push(next: T): void;
  undo(): void;
}

interface LineNode { id: string; x: number; y: number; type: string; label?: string; }
interface LineEdge { a: string; b: string; cost: number; }
interface LineGraph { nodes: LineNode[]; edges: LineEdge[]; }

export interface AddLineOpts {
  /** Endpoints within this distance of an existing node snap to it
   *  instead of creating a duplicate. */
  snapRadius: number;
  /** Id factory for fresh nodes. Injectable so tests are deterministic. */
  newId: () => string;
  /** When set, the segment is subdivided into intermediate junction
   *  nodes spaced ~`step` px apart so the resulting chain matches the
   *  pen tool's granularity. Intermediate points that land near an
   *  existing node snap to it (no duplicates). Omit for a single edge. */
  step?: number;
}

/**
 * Add a straight line to the graph between two points. Endpoints are
 * snapped to nearby existing nodes (or created if none are within
 * `snapRadius`). When `step` is provided the line is subdivided into
 * intermediate junction nodes ~step px apart, each chained to the
 * next, so a long line behaves like a pen stroke rather than one
 * giant edge. Returns a new graph; the input is not mutated. No-op
 * if both endpoints resolve to the same node.
 */
export function addStraightLine<G extends LineGraph>(
  g: G,
  pa: [number, number],
  pb: [number, number],
  opts: AddLineOpts,
): G {
  const nodes: LineNode[] = [...g.nodes];
  const edges: LineEdge[] = [...g.edges];

  const resolve = (p: [number, number]): string => {
    let best: { node: LineNode; d: number } | null = null;
    for (const n of nodes) {
      const d = Math.hypot(n.x - p[0], n.y - p[1]);
      if (d <= opts.snapRadius && (!best || d < best.d)) best = { node: n, d };
    }
    if (best) return best.node.id;
    const id = opts.newId();
    nodes.push({ id, x: round1(p[0]), y: round1(p[1]), type: "junction" });
    return id;
  };

  // Build the ordered list of resolved node ids along the line: start,
  // intermediate subdivisions (if `step` is set), end.
  const ids: string[] = [resolve(pa)];
  if (opts.step && opts.step > 0) {
    const total = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const segments = Math.max(1, Math.round(total / opts.step));
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const px: [number, number] = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
      ids.push(resolve(px));
    }
  }
  ids.push(resolve(pb));

  // Chain consecutive resolved ids into edges; skip self-pairs and
  // duplicates so back-tracking over an existing path is a no-op.
  for (let i = 1; i < ids.length; i++) {
    const aId = ids[i - 1], bId = ids[i];
    if (aId === bId) continue;
    const dup = edges.some((e) => (e.a === aId && e.b === bId) || (e.a === bId && e.b === aId));
    if (dup) continue;
    const na = nodes.find((n) => n.id === aId)!;
    const nb = nodes.find((n) => n.id === bId)!;
    edges.push({ a: aId, b: bId, cost: Math.round(Math.hypot(na.x - nb.x, na.y - nb.y)) });
  }
  return { ...g, nodes, edges };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

export interface RawBarrier {
  id: string;
  a: [number, number];
  b: [number, number];
}

interface BarrierGraph {
  nodes: any[];
  edges: any[];
  barriers?: RawBarrier[];
}

/**
 * Append a barrier segment to the graph. Zero-length barriers
 * (start == end) are skipped so a stray double-click doesn't pollute
 * the graph. Returns a new graph; input is not mutated.
 */
export function addBarrier<G extends BarrierGraph>(
  g: G,
  a: [number, number],
  b: [number, number],
  opts: { newId: () => string },
): G & { barriers: RawBarrier[] } {
  const barriers: RawBarrier[] = [...(g.barriers ?? [])];
  if (a[0] !== b[0] || a[1] !== b[1]) {
    barriers.push({ id: opts.newId(), a, b });
  }
  return { ...g, barriers };
}

/**
 * SVG circle radius for an editor-overlay node, by type. Centralised
 * so the marker sizes can be tuned without hunting through MapViewer.
 * Operator on-site (2026-05-25) wanted these substantially smaller
 * than the original set (kiosk 16, entrance-main 14, tenant 7,
 * junction 10) — they crowded the map at typical zoom.
 */
export function editNodeRadius(type: string): number {
  switch (type) {
    case "kiosk":           return 8;
    case "entrance-main":   return 7;
    case "entrance-tenant": return 4;
    default:                return 5; // junction + anything else
  }
}

interface StoreCentroidLike {
  id: string;
  centroid?: [number, number] | null;
}

export interface ComposePolygon {
  store_id: string;
  ring: number[][];
}

export interface ComposeOpts {
  /** Tenant polygons. A snap segment that crosses a polygon NOT
   *  owned by either endpoint's store id is rejected, mirroring the
   *  autoconnect rule. Omit to skip polygon filtering. */
  polygons?: ComposePolygon[];
}

/**
 * Build a routable graph from the live editGraph + the static list of
 * store centroids. Each store centroid is added as a `store` node and
 * snap-connected to **its operator-placed entrance-tenant** when one
 * is reachable cleanly. The snap target is chosen by this priority:
 *
 *   1. Nearest entrance-tenant whose segment doesn't cross a foreign
 *      polygon — this is what the operator intended.
 *   2. Nearest editable node of any type whose segment is clean.
 *   3. Nearest editable node ignoring polygons (fallback, only when
 *      nothing clean exists).
 *
 * Vacant stores (no centroid) are skipped. Editable nodes/edges are
 * preserved verbatim. See tests/editor.test.ts.
 */
export function composeRoutingGraph<G extends LineGraph>(
  edit: G,
  stores: StoreCentroidLike[],
  opts: ComposeOpts = {},
): { nodes: LineNode[]; edges: LineEdge[] } {
  const nodes: LineNode[] = [...edit.nodes];
  const edges: LineEdge[] = [...edit.edges];
  const polys = opts.polygons ?? [];
  for (const s of stores) {
    if (!s.centroid) continue;
    const [sx, sy] = s.centroid;
    const sn: LineNode & { store: string } = {
      id: s.id, x: sx, y: sy, type: "store", store: s.id,
    } as any;
    nodes.push(sn);

    // Tier the candidates: entrance-tenants first (by distance), then
    // any other editable node. Within each tier we walk in distance
    // order and pick the first whose snap segment is polygon-clean.
    const entries = edit.nodes
      .map((n) => ({ n, d: Math.hypot(n.x - sx, n.y - sy) }))
      .sort((a, b) => a.d - b.d);
    const tiers: Array<typeof entries> = [
      entries.filter((o) => o.n.type === "entrance-tenant"),
      entries.filter((o) => o.n.type !== "entrance-tenant"),
    ];
    let chosen: { id: string; d: number } | null = null;
    for (const tier of tiers) {
      for (const o of tier) {
        if (snapIsClean([sx, sy], [o.n.x, o.n.y], s.id, polys)) {
          chosen = { id: o.n.id, d: o.d }; break;
        }
      }
      if (chosen) break;
    }
    // Last-resort fallback: absolute nearest ignoring polygons so we
    // still have a connectable graph; autoconnect can fix it later.
    if (!chosen && entries.length > 0) {
      chosen = { id: entries[0].n.id, d: entries[0].d };
    }
    if (chosen) edges.push({ a: chosen.id, b: sn.id, cost: Math.round(chosen.d) });
  }
  return { nodes, edges };
}

/** Polygon-clean test mirroring autoconnect's bridgeIsClean. A snap
 *  segment from the store-centroid to its own entrance crosses the
 *  store's own polygon boundary by design — that's allowed. Other
 *  polygons reject the snap. */
function snapIsClean(
  a: [number, number], b: [number, number],
  ownStore: string,
  polys: ComposePolygon[],
): boolean {
  for (const p of polys) {
    if (p.store_id === ownStore) continue;
    if (segmentEntersRing(a, b, p.ring)) return false;
  }
  return true;
}

function segmentEntersRing(
  a: [number, number], b: [number, number], ring: number[][],
): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (segCross2(a, b, ring[i] as [number, number], ring[j] as [number, number])) return true;
  }
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return pointInRing2(mid, ring);
}

function segCross2(p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): boolean {
  const o = (a: [number, number], b: [number, number], c: [number, number]) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const o1 = o(p1, p2, p3), o2 = o(p1, p2, p4);
  const o3 = o(p3, p4, p1), o4 = o(p3, p4, p2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function pointInRing2(p: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const ix = ((yi > p[1]) !== (yj > p[1])) &&
      (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi);
    if (ix) inside = !inside;
  }
  return inside;
}

export function makeHistory<T>(initial: T, maxSize = 50): History<T> {
  let cur = initial;
  const stack: T[] = [];
  return {
    get current() { return cur; },
    get canUndo() { return stack.length > 0; },
    push(next: T) {
      stack.push(cur);
      if (stack.length > maxSize) stack.shift();
      cur = next;
    },
    undo() {
      if (stack.length === 0) return;
      cur = stack.pop()!;
    },
  };
}
