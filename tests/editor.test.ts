import { describe, it, expect } from "vitest";
import { parseGraphJson, makeHistory, addStraightLine, composeRoutingGraph, editNodeRadius, addBarrier } from "@/src/lib/editor";

/**
 * Editor helpers — keep the file-loading and undo logic out of
 * the React component so we can unit-test them without rendering.
 *
 * parseGraphJson(text): returns { ok: true, graph } on valid input,
 *   { ok: false, error } on anything else. "Valid" = JSON object with
 *   nodes[] and edges[] arrays where every edge's a/b reference a
 *   node id that exists.
 *
 * makeHistory(initial): a tiny LIFO stack with push() + undo() +
 *   canUndo + current. push() records the PREVIOUS state so the
 *   current value is always whatever was last set.
 */

describe("parseGraphJson", () => {
  it("accepts a well-formed graph file", () => {
    const text = JSON.stringify({
      nodes: [
        { id: "a", x: 0, y: 0, type: "junction" },
        { id: "b", x: 1, y: 1, type: "junction" },
      ],
      edges: [{ a: "a", b: "b", cost: 1 }],
    });
    const r = parseGraphJson(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.graph.nodes.length).toBe(2);
      expect(r.graph.edges.length).toBe(1);
    }
  });

  it("rejects non-JSON text", () => {
    const r = parseGraphJson("not json {");
    expect(r.ok).toBe(false);
  });

  it("rejects JSON without nodes/edges arrays", () => {
    expect(parseGraphJson("{}").ok).toBe(false);
    expect(parseGraphJson(JSON.stringify({ nodes: 1 })).ok).toBe(false);
    expect(parseGraphJson(JSON.stringify({ nodes: [], edges: "x" })).ok).toBe(false);
  });

  it("preserves an optional `barriers` array on the loaded graph", () => {
    const text = JSON.stringify({
      nodes: [
        { id: "a", x: 0, y: 0, type: "junction" },
        { id: "b", x: 1, y: 1, type: "junction" },
      ],
      edges: [{ a: "a", b: "b", cost: 1 }],
      barriers: [{ id: "bar-1", a: [10, 20], b: [30, 40] }],
    });
    const r = parseGraphJson(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.graph as any).barriers).toEqual([
        { id: "bar-1", a: [10, 20], b: [30, 40] },
      ]);
    }
  });

  it("rejects edges that reference unknown node ids", () => {
    const text = JSON.stringify({
      nodes: [{ id: "a", x: 0, y: 0, type: "junction" }],
      edges: [{ a: "a", b: "missing", cost: 1 }],
    });
    const r = parseGraphJson(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown/i);
  });

  it("rejects nodes missing required fields", () => {
    const r = parseGraphJson(JSON.stringify({
      nodes: [{ id: "a", x: 0 }], edges: [],
    }));
    expect(r.ok).toBe(false);
  });
});

describe("addStraightLine", () => {
  type N = { id: string; x: number; y: number; type: string };
  type E = { a: string; b: string; cost: number };

  it("creates two new nodes + one edge when endpoints are far from existing nodes", () => {
    const g = { nodes: [] as N[], edges: [] as E[] };
    const out = addStraightLine(g, [0, 0], [100, 0], { snapRadius: 10, newId: mkIdGen() });
    expect(out.nodes.length).toBe(2);
    expect(out.edges.length).toBe(1);
    const e = out.edges[0];
    expect(e.cost).toBe(100);
    const a = out.nodes.find((n) => n.id === e.a)!;
    const b = out.nodes.find((n) => n.id === e.b)!;
    expect([a.x, a.y, b.x, b.y].sort()).toEqual([0, 0, 0, 100].sort());
    expect(a.type).toBe("junction");
  });

  it("snaps an endpoint to an existing nearby node instead of creating a duplicate", () => {
    const g: { nodes: N[]; edges: E[] } = {
      nodes: [{ id: "existing", x: 0, y: 0, type: "junction" }],
      edges: [],
    };
    const out = addStraightLine(g, [2, 1], [100, 0], { snapRadius: 10, newId: mkIdGen() });
    // One brand-new node (the far endpoint); existing is reused.
    expect(out.nodes.length).toBe(2);
    expect(out.edges.length).toBe(1);
    expect(out.edges[0].a === "existing" || out.edges[0].b === "existing").toBe(true);
  });

  it("does not create a duplicate edge between two existing nodes", () => {
    const g: { nodes: N[]; edges: E[] } = {
      nodes: [
        { id: "a", x: 0,   y: 0, type: "junction" },
        { id: "b", x: 100, y: 0, type: "junction" },
      ],
      edges: [{ a: "a", b: "b", cost: 100 }],
    };
    const out = addStraightLine(g, [0, 0], [100, 0], { snapRadius: 10, newId: mkIdGen() });
    expect(out.nodes.length).toBe(2);
    expect(out.edges.length).toBe(1);
  });

  it("does nothing when both endpoints snap to the same existing node (no self-loop)", () => {
    const g: { nodes: N[]; edges: E[] } = {
      nodes: [{ id: "x", x: 50, y: 50, type: "junction" }],
      edges: [],
    };
    const out = addStraightLine(g, [50, 50], [51, 51], { snapRadius: 10, newId: mkIdGen() });
    expect(out.nodes.length).toBe(1);
    expect(out.edges.length).toBe(0);
  });

  it("subdivides a long straight line into intermediate junctions ~step apart", () => {
    const g = { nodes: [] as N[], edges: [] as E[] };
    // 300 px line with step=30 → expect ~10 segments (11 nodes).
    const out = addStraightLine(g, [0, 0], [300, 0], { snapRadius: 5, step: 30, newId: mkIdGen() });
    expect(out.nodes.length).toBeGreaterThanOrEqual(10);
    expect(out.nodes.length).toBeLessThanOrEqual(12);
    expect(out.edges.length).toBe(out.nodes.length - 1);
    // Every intermediate edge is short (≈ step px), not one 300-px span.
    for (const e of out.edges) expect(e.cost).toBeLessThanOrEqual(35);
    // Subdivisions are collinear with the original line.
    for (const n of out.nodes) expect(n.y).toBeCloseTo(0, 5);
  });

  it("snaps the first subdivision near a pre-existing node instead of doubling up", () => {
    const g: { nodes: N[]; edges: E[] } = {
      // A node sits where the first ~30-px subdivision would land.
      nodes: [{ id: "mid", x: 30, y: 0, type: "junction" }],
      edges: [],
    };
    const out = addStraightLine(g, [0, 0], [90, 0], { snapRadius: 10, step: 30, newId: mkIdGen() });
    // `mid` should be reused, not duplicated.
    const atMid = out.nodes.filter((n) => Math.hypot(n.x - 30, n.y) < 1);
    expect(atMid.length).toBe(1);
    expect(atMid[0].id).toBe("mid");
  });

  function mkIdGen() {
    let i = 0;
    return () => `gen-${i++}`;
  }
});

describe("composeRoutingGraph", () => {
  /**
   * The edit-mode route preview needs a runnable routing graph built
   * from the LIVE edited nodes/edges plus the store centroids the
   * operator can't see in the editor. composeRoutingGraph attaches
   * each store centroid to its nearest editable node by a single
   * snap-edge so the routing engine treats the store as reachable
   * iff its nearest editable node is reachable.
   */
  type N = { id: string; x: number; y: number; type: string };
  type E = { a: string; b: string; cost: number };

  it("attaches every store centroid to its nearest editable node", () => {
    const edit = {
      nodes: [
        { id: "j1", x: 0,   y: 0, type: "junction" },
        { id: "j2", x: 100, y: 0, type: "junction" },
      ] as N[],
      edges: [{ a: "j1", b: "j2", cost: 100 }] as E[],
    };
    const stores = [
      { id: "left",  centroid: [5,   1] as [number, number] },
      { id: "right", centroid: [99, -2] as [number, number] },
    ];
    const out = composeRoutingGraph(edit, stores);
    // Two store nodes + two snap-edges added.
    expect(out.nodes.filter((n) => n.type === "store").length).toBe(2);
    expect(out.edges.length).toBe(edit.edges.length + 2);
    // Each new store-edge connects the centroid to the geometrically
    // nearest editable node.
    const leftSnap = out.edges.find((e) => e.a === "left" || e.b === "left")!;
    expect([leftSnap.a, leftSnap.b].sort()).toEqual(["j1", "left"].sort());
    const rightSnap = out.edges.find((e) => e.a === "right" || e.b === "right")!;
    expect([rightSnap.a, rightSnap.b].sort()).toEqual(["j2", "right"].sort());
  });

  it("preserves the editable nodes/edges verbatim", () => {
    const edit = {
      nodes: [{ id: "a", x: 0, y: 0, type: "junction" }] as N[],
      edges: [] as E[],
    };
    const out = composeRoutingGraph(edit, [
      { id: "shop", centroid: [10, 10] as [number, number] },
    ]);
    expect(out.nodes.slice(0, 1)).toEqual(edit.nodes);
  });

  it("skips stores with no centroid", () => {
    const edit = {
      nodes: [{ id: "a", x: 0, y: 0, type: "junction" }] as N[],
      edges: [] as E[],
    };
    const out = composeRoutingGraph(edit, [
      { id: "good", centroid: [10, 10] as [number, number] },
      { id: "vacant", centroid: null },
    ]);
    expect(out.nodes.filter((n) => n.type === "store").map((n) => (n as any).id)).toEqual(["good"]);
  });

  it("produces an empty graph when there are no editable nodes (no store snaps)", () => {
    const out = composeRoutingGraph({ nodes: [], edges: [] }, [
      { id: "a", centroid: [0, 0] as [number, number] },
    ]);
    // No snap target → centroid is added but no snap-edge.
    expect(out.nodes.filter((n) => n.type === "store").length).toBe(1);
    expect(out.edges.length).toBe(0);
  });

  it("prefers an entrance-tenant snap target over a closer junction", () => {
    // A junction sits closer to the store centroid than the entrance,
    // but the operator's intent is that the store always snaps to its
    // entrance-tenant.
    const edit = {
      nodes: [
        { id: "junc", x: 5,  y: 0, type: "junction" },
        { id: "ent",  x: 12, y: 0, type: "entrance-tenant" },
      ] as N[],
      edges: [] as E[],
    };
    const out = composeRoutingGraph(edit, [
      { id: "shop", centroid: [0, 0] as [number, number] },
    ]);
    const snap = out.edges.find((e) => e.a === "shop" || e.b === "shop")!;
    expect([snap.a, snap.b].includes("ent")).toBe(true);
  });

  it("rejects a snap that would cut through a foreign polygon", () => {
    // Junction is closer to the store centroid than the entrance, but
    // the segment store→junction passes through a foreign polygon.
    // Compose must skip the junction and pick the entrance instead.
    const edit = {
      nodes: [
        { id: "junc", x: 50, y: 0, type: "junction" },
        { id: "ent",  x: 0,  y: 5, type: "entrance-tenant" },
      ] as N[],
      edges: [] as E[],
    };
    // Polygon belongs to "neighbor" and sits between the store centroid
    // at (0,0) and the junction at (50,0).
    const polys = [{
      store_id: "neighbor",
      ring: [[10, -10], [40, -10], [40, 10], [10, 10], [10, -10]],
    }];
    const out = composeRoutingGraph(edit, [
      { id: "shop", centroid: [0, 0] as [number, number] },
    ], { polygons: polys });
    const snap = out.edges.find((e) => e.a === "shop" || e.b === "shop")!;
    expect([snap.a, snap.b].includes("ent")).toBe(true);
  });

  it("allows a snap that crosses the store's OWN polygon", () => {
    // The store-centroid sits inside its own polygon; the entrance
    // sits on the boundary. The snap line crosses the polygon by
    // design — this must be allowed.
    const edit = {
      nodes: [{ id: "ent", x: 10, y: 0, type: "entrance-tenant" }] as N[],
      edges: [] as E[],
    };
    const polys = [{
      store_id: "shop",
      ring: [[-5, -5], [10, -5], [10, 5], [-5, 5], [-5, -5]],
    }];
    const out = composeRoutingGraph(edit, [
      { id: "shop", centroid: [0, 0] as [number, number] },
    ], { polygons: polys });
    expect(out.edges.length).toBe(1);
    expect([out.edges[0].a, out.edges[0].b].includes("ent")).toBe(true);
  });
});

describe("addBarrier", () => {
  it("appends a new barrier segment with a fresh id", () => {
    const g = { nodes: [], edges: [], barriers: [] };
    const out = addBarrier(g, [10, 20], [100, 20], { newId: () => "bar-x" });
    expect(out.barriers).toEqual([{ id: "bar-x", a: [10, 20], b: [100, 20] }]);
    // Existing fields are preserved.
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it("works when `barriers` is omitted from the input graph", () => {
    const g = { nodes: [{ id: "a", x: 0, y: 0, type: "junction" }], edges: [] };
    const out = addBarrier(g as any, [0, 0], [10, 10], { newId: () => "b1" });
    expect(out.barriers).toEqual([{ id: "b1", a: [0, 0], b: [10, 10] }]);
    expect(out.nodes).toHaveLength(1);
  });

  it("ignores zero-length barriers (start == end)", () => {
    const g = { nodes: [], edges: [], barriers: [] };
    const out = addBarrier(g, [42, 42], [42, 42], { newId: () => "b1" });
    expect(out.barriers).toEqual([]);
  });
});

describe("editNodeRadius", () => {
  it("returns small radii so editor markers don't crowd the map", () => {
    // Operator on-site (2026-05-25) reported markers were too big.
    // Pin the smaller values so they don't drift back up.
    expect(editNodeRadius("kiosk")).toBe(8);
    expect(editNodeRadius("entrance-main")).toBe(7);
    expect(editNodeRadius("entrance-tenant")).toBe(4);
    expect(editNodeRadius("junction")).toBe(5);
  });
  it("falls back to the junction size for unknown types", () => {
    expect(editNodeRadius("anything-else" as any)).toBe(5);
  });
});

describe("makeHistory", () => {
  type G = { nodes: { id: string }[]; edges: never[] };
  const empty: G = { nodes: [], edges: [] };
  const one: G = { nodes: [{ id: "a" }], edges: [] };
  const two: G = { nodes: [{ id: "a" }, { id: "b" }], edges: [] };

  it("starts with the initial state and no undo available", () => {
    const h = makeHistory(empty);
    expect(h.current).toBe(empty);
    expect(h.canUndo).toBe(false);
  });

  it("push() saves the previous state and updates current", () => {
    const h = makeHistory(empty);
    h.push(one);
    expect(h.current).toBe(one);
    expect(h.canUndo).toBe(true);
  });

  it("undo() restores the previous state and pops history", () => {
    const h = makeHistory(empty);
    h.push(one);
    h.push(two);
    expect(h.current).toBe(two);
    h.undo();
    expect(h.current).toBe(one);
    h.undo();
    expect(h.current).toBe(empty);
    expect(h.canUndo).toBe(false);
  });

  it("undo() at the bottom of the stack is a no-op", () => {
    const h = makeHistory(empty);
    h.undo();
    expect(h.current).toBe(empty);
    h.undo();
    expect(h.current).toBe(empty);
  });

  it("caps history at maxSize so memory doesn't grow unbounded", () => {
    const h = makeHistory<G>(empty, 3);
    for (let i = 0; i < 20; i++) {
      h.push({ nodes: [{ id: String(i) }], edges: [] });
    }
    // Can undo at most 3 times.
    let undos = 0;
    while (h.canUndo) { h.undo(); undos++; }
    expect(undos).toBe(3);
  });
});
