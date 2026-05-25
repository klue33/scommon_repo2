import { describe, it, expect } from "vitest";
import { autoconnect } from "@/src/lib/autoconnect";

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
