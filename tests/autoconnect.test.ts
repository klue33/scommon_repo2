import { describe, it, expect } from "vitest";
import { autoconnect } from "@/src/lib/autoconnect";
import { squarePolygon } from "./_fixtures/polygons";

/**
 * Contract for `autoconnect`.
 *
 * Input: a graph spec (the same shape as `data/graph.json`) that may
 *        have multiple connected components.
 * Output: a NEW graph spec with the minimum number of bridging edges
 *         added so the graph becomes a single connected component.
 *         Every original node and edge is preserved exactly; only
 *         new edges are added.
 *
 * Strategy:
 *   - Pick the largest connected component as the "spine."
 *   - For each non-spine component, add ONE edge: the geometrically
 *     nearest pair of (this component, spine), with cost = Euclidean
 *     distance rounded to int.
 *   - Bridging edges are marked `auto: true` so the operator can
 *     audit them in the in-app editor.
 *
 * Result: graph has exactly 1 connected component. New edge count
 * is (original_components - 1). User-drawn paths are unmodified.
 */

type Node = { id: string; x: number; y: number; type: string; store?: string };
type Edge = { a: string; b: string; cost: number; auto?: boolean };

function components(g: { nodes: Node[]; edges: Edge[] }): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
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
  return out;
}

function adjConnected(g: { nodes: Node[]; edges: Edge[] }): boolean {
  return components(g).length === 1;
}

describe("autoconnect", () => {
  it("preserves an already-connected graph unchanged", () => {
    const g = {
      nodes: [
        { id: "a", x: 0,   y: 0, type: "junction" },
        { id: "b", x: 100, y: 0, type: "junction" },
        { id: "c", x: 200, y: 0, type: "junction" },
      ] as Node[],
      edges: [
        { a: "a", b: "b", cost: 100 },
        { a: "b", b: "c", cost: 100 },
      ] as Edge[],
    };
    const out = autoconnect(g);
    expect(out.nodes).toEqual(g.nodes);
    expect(out.edges).toEqual(g.edges);
    expect(components(out).length).toBe(1);
  });

  it("bridges two components with one shortest-distance edge", () => {
    const g = {
      nodes: [
        { id: "left-1",  x: 0,   y: 0, type: "junction" },
        { id: "left-2",  x: 10,  y: 0, type: "junction" },
        { id: "right-1", x: 100, y: 0, type: "junction" },
        { id: "right-2", x: 200, y: 0, type: "junction" },
      ] as Node[],
      edges: [
        { a: "left-1",  b: "left-2",  cost: 10 },
        { a: "right-1", b: "right-2", cost: 100 },
      ] as Edge[],
    };
    const out = autoconnect(g);
    // Original edges preserved.
    expect(out.edges.slice(0, 2)).toEqual(g.edges);
    // Exactly one new edge.
    expect(out.edges.length).toBe(3);
    const added = out.edges[2];
    // Should bridge the nearest pair: left-2 ↔ right-1 (distance 90).
    expect(new Set([added.a, added.b])).toEqual(new Set(["left-2", "right-1"]));
    expect(added.cost).toBe(90);
    expect(added.auto).toBe(true);
    // Single component now.
    expect(components(out).length).toBe(1);
  });

  it("merges N components with exactly N-1 bridging edges", () => {
    // Three components: a-b, c-d, e-f.
    const g = {
      nodes: [
        { id: "a", x: 0,    y: 0, type: "junction" },
        { id: "b", x: 10,   y: 0, type: "junction" },
        { id: "c", x: 100,  y: 0, type: "junction" },
        { id: "d", x: 110,  y: 0, type: "junction" },
        { id: "e", x: 1000, y: 0, type: "junction" },
        { id: "f", x: 1010, y: 0, type: "junction" },
      ] as Node[],
      edges: [
        { a: "a", b: "b", cost: 10 },
        { a: "c", b: "d", cost: 10 },
        { a: "e", b: "f", cost: 10 },
      ] as Edge[],
    };
    const out = autoconnect(g);
    expect(out.edges.length).toBe(g.edges.length + 2);
    expect(components(out).length).toBe(1);
    // All added edges are flagged as auto.
    const added = out.edges.slice(g.edges.length);
    expect(added.every((e) => e.auto === true)).toBe(true);
  });

  it("attaches an orphan store to the nearest node on the spine", () => {
    const g = {
      nodes: [
        { id: "spine-a", x: 0,   y: 0,  type: "junction" },
        { id: "spine-b", x: 50,  y: 0,  type: "junction" },
        { id: "spine-c", x: 100, y: 0,  type: "junction" },
        // Orphan store, geometrically nearest to spine-b.
        { id: "store-x", x: 55,  y: 30, type: "store", store: "store-x" },
      ] as Node[],
      edges: [
        { a: "spine-a", b: "spine-b", cost: 50 },
        { a: "spine-b", b: "spine-c", cost: 50 },
      ] as Edge[],
    };
    const out = autoconnect(g);
    expect(components(out).length).toBe(1);
    const added = out.edges.filter((e) => e.auto);
    expect(added.length).toBe(1);
    const e = added[0];
    expect(new Set([e.a, e.b])).toEqual(new Set(["store-x", "spine-b"]));
  });

  it("rejects a bridge that would cross a foreign polygon's interior", () => {
    // Layout (top-down view):
    //   spine: L1(0,50) ─ L2(50,50) ─ N(150,-30)   [N is a detour
    //          junction north of the polygon, already connected to L2]
    //   floating component: R1(250,50) ─ R2(300,50)
    //   polygon: [100,0]-[200,0]-[200,100]-[100,100] sits between.
    //
    // The naive nearest pair to bridge R1-R2 into the spine is
    // L2 ↔ R1 (distance 200), but that segment crosses straight
    // through the polygon. Polygon-aware autoconnect must reject
    // that and take the next-clean candidate: R2 ↔ N (~170),
    // which routes ABOVE the polygon without entering it.
    const g = {
      nodes: [
        { id: "L1", x: 0,   y: 50,  type: "junction" as const },
        { id: "L2", x: 50,  y: 50,  type: "junction" as const },
        { id: "N",  x: 150, y: -30, type: "junction" as const },
        { id: "R1", x: 250, y: 50,  type: "junction" as const },
        { id: "R2", x: 300, y: 50,  type: "junction" as const },
      ],
      edges: [
        { a: "L1", b: "L2", cost: 50 },
        { a: "L2", b: "N",  cost: 130 },
        { a: "R1", b: "R2", cost: 50 },
      ],
    };
    const out = autoconnect(g, { polygons: [squarePolygon] });
    expect(adjConnected(out)).toBe(true);
    // The polygon-crossing direct edge must NOT be added.
    const direct = out.edges.find(
      (e) => (e.a === "L2" && e.b === "R1") || (e.a === "R1" && e.b === "L2"),
    );
    expect(direct).toBeUndefined();
  });

  it("allows a bridge whose endpoint IS the polygon's own store-centroid", () => {
    // Edge case: a bridge from a store-centroid INSIDE its own polygon
    // out to an adjacent entrance must be allowed (the route from
    // centroid to entrance crosses the polygon boundary by design).
    const g = {
      nodes: [
        // The polygon is squarePolygon (id 'x'). The store-centroid
        // 'x' lives at the centre of that polygon.
        { id: "x",      x: 150, y: 50,  type: "store" as const, store: "x" },
        // A nearby entrance just outside the polygon.
        { id: "ent",    x: 150, y: 110, type: "entrance-tenant" as const },
        // Another component to force autoconnect to bridge.
        { id: "spine",  x: 150, y: 200, type: "junction" as const },
      ],
      // No edges yet — autoconnect must propose bridges that get
      // every node into one component.
      edges: [],
    };
    const out = autoconnect(g, { polygons: [squarePolygon] });
    expect(adjConnected(out)).toBe(true);
    // x → ent crosses the polygon X but X is x's own polygon, so it's
    // allowed. The bridge to spine must not cross any unrelated polygon
    // (there isn't one here so trivially fine).
  });

  it("never produces a self-loop or duplicate edge", () => {
    const g = {
      nodes: [
        { id: "a", x: 0,   y: 0, type: "junction" },
        { id: "b", x: 100, y: 0, type: "junction" },
      ] as Node[],
      edges: [{ a: "a", b: "b", cost: 100 } as Edge],
    };
    const out = autoconnect(g);
    expect(out.edges.length).toBe(1);
    expect(out.edges).toEqual(g.edges);
  });
});
