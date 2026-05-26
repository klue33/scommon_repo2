/**
 * Graph-health diagnostics.
 *
 * The site graph is hand-traced in the live editor at
 * `http://127.0.0.1:3100/?edit=1`. While it's being authored,
 * the kiosk-to-store integration tests in `pathfind.test.ts`
 * are skipped because the graph isn't yet a single connected
 * component.
 *
 * These tests don't *enforce* a single component (the graph is
 * a work in progress) — they *report* the current connectivity
 * state on every test run, and they DO enforce a small set of
 * invariants that must hold regardless of how WIP the graph is:
 *
 *   1. The graph object loads and has a `nodes` and `edges`
 *      array.
 *   2. Every edge references node IDs that exist in `nodes`.
 *   3. Every `store`-typed node has a `store` field whose
 *      value matches a node id (the node id IS the store id by
 *      our convention — see CLAUDE.md).
 *   4. There's at least one kiosk node.
 *
 * Once the connectivity report shows a single component, un-skip
 * the integration tests in `pathfind.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import graph from "@/data/graph.json";

const geo = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../public/maps/site.geojson", import.meta.url)),
    "utf8",
  ),
) as { features: Array<{ geometry?: { type: string; coordinates: number[][][] }; properties?: any }> };

type Node = { id: string; x: number; y: number; type: string; store?: string };
type Edge = { a: string; b: string; cost: number };

const nodes = graph.nodes as Node[];
const edges = graph.edges as Edge[];

function components(): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of nodes) {
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
  return out;
}

describe("graph-health", () => {
  it("loads with a nodes + edges array", () => {
    expect(Array.isArray(nodes)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("has at least one kiosk", () => {
    const kiosks = nodes.filter((n) => n.type === "kiosk");
    expect(kiosks.length).toBeGreaterThanOrEqual(1);
  });

  it("every edge references a node that exists", () => {
    const ids = new Set(nodes.map((n) => n.id));
    const orphans = edges.filter((e) => !ids.has(e.a) || !ids.has(e.b));
    expect(orphans, JSON.stringify(orphans.slice(0, 5))).toEqual([]);
  });

  it("no edge cuts through a foreign tenant polygon", () => {
    // Tenants (occupied AND vacant) are physical units on the floor —
    // walking-route edges may not slice through them. The exception
    // is a store-centroid → its OWN entrance, which by design crosses
    // the polygon's boundary from inside out.
    const polys = geo.features
      .filter((f) => f.geometry?.type === "Polygon")
      .map((f) => ({
        store_id: f.properties?.store_id ?? "?",
        ring: f.geometry!.coordinates[0] as number[][],
      }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const offenders: Array<{ a: string; b: string; through: string }> = [];
    const orient = (a: number[], b: number[], c: number[]) =>
      Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const segCross = (p1: number[], p2: number[], p3: number[], p4: number[]) => {
      const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
      const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
      return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
    };
    const inRing = (p: number[], ring: number[][]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const ix = ((yi > p[1]) !== (yj > p[1])) &&
          (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi);
        if (ix) inside = !inside;
      }
      return inside;
    };
    const enters = (a: number[], b: number[], ring: number[][]) => {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (segCross(a, b, ring[i], ring[j])) return true;
      }
      return inRing([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ring);
    };
    for (const e of edges) {
      // Autoconnect-fallback bridges that own up to crossing a polygon
      // are operator-visible; pathfind already lets the route through
      // by edge cost. Don't double-fail them here.
      if ((e as any).crossesPolygon) continue;
      const na = nodeById.get(e.a), nb = nodeById.get(e.b);
      if (!na || !nb) continue;
      for (const p of polys) {
        // A polygon is "owned" by either endpoint if that endpoint
        // is the store centroid for the polygon OR the endpoint
        // sits inside the polygon (e.g. an entrance-tenant node
        // placed at the door). Mirrors pathfind's filter.
        const aOwns = (na.type === "store" && na.store === p.store_id) ||
          inRing([na.x, na.y], p.ring);
        const bOwns = (nb.type === "store" && nb.store === p.store_id) ||
          inRing([nb.x, nb.y], p.ring);
        if (aOwns || bOwns) continue;
        if (enters([na.x, na.y], [nb.x, nb.y], p.ring)) {
          offenders.push({ a: e.a, b: e.b, through: p.store_id });
          break;
        }
      }
    }
    expect(
      offenders.length,
      `${offenders.length} unflagged edges cross foreign polygons. First 5: ${JSON.stringify(offenders.slice(0, 5))}`,
    ).toBe(0);
  });

  it("Sunshine Healthcare's tenant entrance is on the NE face of its polygon", () => {
    // On-site confirmation (2026-05-25): Sunshine's real entrance
    // is on the NE face, near (682.7, 783.8) — closer to the
    // No Frills north entrance than the NW face midpoint (654, 804)
    // the previous version asserted. This supersedes the earlier
    // NW-face claim.
    const sunshineId = "sunshine-healthcare";
    const adjEdges = edges.filter((e) => e.a === sunshineId || e.b === sunshineId);
    const entranceIds = adjEdges
      .map((e) => (e.a === sunshineId ? e.b : e.a))
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is Node => !!n && n.type === "entrance-tenant");
    expect(entranceIds.length).toBeGreaterThan(0);
    // At least one tenant entrance for Sunshine must sit on the
    // NE face — within ~25 px of (682.7, 783.8).
    const onNeFace = entranceIds.some(
      (n) => Math.hypot(n.x - 682.7, n.y - 783.8) <= 25,
    );
    expect(onNeFace, `entrance positions: ${JSON.stringify(entranceIds.map((n) => [n.x, n.y]))}`).toBe(true);
  });

  it("Dollarama only enters/exits via an entrance inside its own polygon", () => {
    // On-site observation (2026-05-26): the path out of Dollarama
    // was routing through Cell Max because Dollarama's recorded
    // entrance-tenant node sat inside cell-max's polygon (it's at
    // a point in the small notch dollarama cuts out for cell-max).
    // Every entrance node bonded to dollarama must live inside the
    // dollarama polygon, not inside any other tenant.
    const dollId = "dollarama";
    const polys = geo.features
      .filter((f) => f.geometry?.type === "Polygon")
      .map((f) => ({
        store_id: f.properties?.store_id ?? "?",
        ring: f.geometry!.coordinates![0] as number[][],
      }));
    const dollPoly = polys.find((p) => p.store_id === dollId);
    expect(dollPoly, "dollarama polygon missing from geojson").toBeDefined();
    const inRing = (pt: number[], ring: number[][]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = (yi > pt[1]) !== (yj > pt[1]) &&
          pt[0] < ((xj - xi) * (pt[1] - yi)) / ((yj - yi) || 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };
    const adjEdges = edges.filter((e) => e.a === dollId || e.b === dollId);
    expect(adjEdges.length).toBeGreaterThan(0);
    const offenders: Array<{ entrance: string; insideStore: string | null }> = [];
    for (const e of adjEdges) {
      const otherId = e.a === dollId ? e.b : e.a;
      const other = nodes.find((n) => n.id === otherId);
      if (!other) continue;
      if (!inRing([other.x, other.y], dollPoly!.ring)) {
        // Find which tenant the misplaced entrance actually sits in.
        let foundIn: string | null = null;
        for (const p of polys) {
          if (p.store_id === dollId) continue;
          if (inRing([other.x, other.y], p.ring)) { foundIn = p.store_id; break; }
        }
        offenders.push({ entrance: otherId, insideStore: foundIn });
      }
    }
    expect(
      offenders,
      `dollarama edges go through entrances that aren't inside dollarama: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it("no walking edge crosses an operator-drawn barrier", () => {
    // Barriers are operator-defined lines that the wayfinder can't
    // cross. The on-disk graph is what visitors actually use — any
    // edge intersecting a barrier means autoconnect (or a stale save)
    // bridged through a wall and visitors would be misrouted.
    const barriers = ((graph as any).barriers ?? []) as Array<{
      id: string; a: [number, number]; b: [number, number];
    }>;
    if (barriers.length === 0) return; // no barriers, nothing to enforce
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const orient = (a: number[], b: number[], c: number[]) =>
      Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const cross = (p1: number[], p2: number[], p3: number[], p4: number[]) => {
      const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
      const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
      return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
    };
    const offenders: Array<{ a: string; b: string; barrier: string }> = [];
    for (const e of edges) {
      // Autoconnect-fallback bridges that admit they cross a barrier
      // are operator-visible. They're flagged here for a reason and
      // pathfind drops them at build time anyway.
      if ((e as any).crossesBarrier) continue;
      const na = nodeById.get(e.a), nb = nodeById.get(e.b);
      if (!na || !nb) continue;
      for (const bar of barriers) {
        if (cross([na.x, na.y], [nb.x, nb.y], bar.a, bar.b)) {
          offenders.push({ a: e.a, b: e.b, barrier: bar.id });
          break;
        }
      }
    }
    expect(
      offenders.length,
      `${offenders.length} unflagged edges cross a barrier. First 5: ${JSON.stringify(offenders.slice(0, 5))}`,
    ).toBe(0);
  });

  it("every store-typed node has a `store` field equal to its id", () => {
    const offenders = nodes
      .filter((n) => n.type === "store")
      .filter((n) => !n.store || n.store !== n.id);
    expect(offenders, JSON.stringify(offenders.slice(0, 5))).toEqual([]);
  });

  it("reports current connectivity state (does not enforce, just logs)", () => {
    const comps = components();
    const biggest = Math.max(...comps.map((c) => c.length));
    const orphans = nodes.filter((n) => {
      const adj = edges.some((e) => e.a === n.id || e.b === n.id);
      return !adj;
    });
    const kiosks = nodes.filter((n) => n.type === "kiosk");
    // Per-kiosk reach — Kiosk 2 is intentionally ignored (no
    // edges); the operative kiosk is the one with the most
    // connections. We report all kiosks but mark Kiosk 2 as
    // ignored so its zero-reach doesn't read as a bug.
    const kioskReach = kiosks.map((k) => {
      const adj = edges.filter((e) => e.a === k.id || e.b === k.id).length;
      return {
        id: k.id,
        label: (k as any).label ?? "(unlabeled)",
        reachable: comps.find((c) => c.includes(k.id))?.length ?? 0,
        ignored: adj === 0,
      };
    });

    // eslint-disable-next-line no-console
    console.log(
      "[graph-health]",
      JSON.stringify(
        {
          nodes: nodes.length,
          edges: edges.length,
          components: comps.length,
          biggestComponent: biggest,
          orphanNodes: orphans.length,
          kiosks: kioskReach,
          ready: comps.length === 1 ? "yes — un-skip the integration tests" : "no — keep wiring in the editor",
        },
        null,
        2,
      ),
    );

    // This expectation is informational: as long as the graph
    // has *something*, this test passes. The number-of-components
    // metric is logged above so the user sees progress.
    expect(nodes.length).toBeGreaterThan(0);
  });
});
