import { describe, it, expect } from "vitest";
import { buildGraph, route, routeBetweenStores } from "@/src/lib/pathfind";
import graph from "@/data/graph.json";

// Resolve kiosk IDs from the production graph at runtime so the
// tests don't break when the graph is re-traced under new IDs.
// Kiosk 2 is currently ignored (no edges) — Kiosk 1 is the only
// operative kiosk. Tests treat the first kiosk-typed node as
// "the kiosk".
const kiosks = (graph.nodes as any[]).filter((n) => n.type === "kiosk");
const KIOSK_A = kiosks[0]?.id;

// Graph is hand-traced in the live editor at
// http://127.0.0.1:3100/?edit=1, then post-processed by
// `scripts/autoconnect.mjs` to bridge disconnected components
// with short edges marked `auto:true`. As long as the editor
// always exports a graph that autoconnect can resolve, these
// integration tests stay green.

describe("pathfind", () => {
  it("the production graph has at least one kiosk", () => {
    expect(KIOSK_A).toBeDefined();
  });

  it("routes from a kiosk to a real tenant", () => {
    const g = buildGraph(graph as any);
    const r = route(g, KIOSK_A, "bmo");
    expect(r).not.toBeNull();
    expect(r!.path[0]).toBe(KIOSK_A);
    expect(r!.path.at(-1)).toBe("bmo");
    expect(r!.points.length).toBeGreaterThan(1);
  });

  it("routes tenant → tenant strictly along graph edges", () => {
    // Fixture: two stores at opposite ends of a spine of junctions.
    // The only way from store-1 to store-2 is along the spine —
    // there's no straight-line shortcut even though the stores are
    // 200 units apart on the same y. This pins down the
    // "no off-graph traversal" contract: the route MUST visit each
    // junction in order.
    const g = buildGraph({
      nodes: [
        { id: "store-1", x: 0,   y: 0,  type: "store", store: "store-1" },
        { id: "ent-1",   x: 25,  y: 0,  type: "entrance-tenant" },
        { id: "j-1",     x: 50,  y: 0,  type: "junction" },
        { id: "j-2",     x: 100, y: 0,  type: "junction" },
        { id: "j-3",     x: 150, y: 0,  type: "junction" },
        { id: "ent-2",   x: 175, y: 0,  type: "entrance-tenant" },
        { id: "store-2", x: 200, y: 0,  type: "store", store: "store-2" },
      ],
      edges: [
        { a: "store-1", b: "ent-1",   cost: 25 },
        { a: "ent-1",   b: "j-1",     cost: 25 },
        { a: "j-1",     b: "j-2",     cost: 50 },
        { a: "j-2",     b: "j-3",     cost: 50 },
        { a: "j-3",     b: "ent-2",   cost: 25 },
        { a: "ent-2",   b: "store-2", cost: 25 },
      ],
    });
    const r = route(g, "store-1", "store-2");
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(["store-1", "ent-1", "j-1", "j-2", "j-3", "ent-2", "store-2"]);
    expect(r!.cost).toBe(200);
    expect(r!.points).toEqual([
      [0, 0], [25, 0], [50, 0], [100, 0], [150, 0], [175, 0], [200, 0],
    ]);
  });

  it("refuses to route between tenants in different components", () => {
    // Two disconnected sub-graphs. No straight-line fallback allowed.
    const g = buildGraph({
      nodes: [
        { id: "store-a", x: 0,   y: 0, type: "store", store: "store-a" },
        { id: "j-a",     x: 10,  y: 0, type: "junction" },
        { id: "store-b", x: 500, y: 0, type: "store", store: "store-b" },
        { id: "j-b",     x: 510, y: 0, type: "junction" },
      ],
      edges: [
        { a: "store-a", b: "j-a",     cost: 10 },
        { a: "j-b",     b: "store-b", cost: 10 },
      ],
    });
    expect(route(g, "store-a", "store-b")).toBeNull();
  });

  it("picks the lower-cost route when alternatives exist", () => {
    const g = buildGraph({
      nodes: [
        { id: "a", x: 0,   y: 0,  type: "kiosk" },
        { id: "b", x: 100, y: 0,  type: "junction" },
        { id: "ent-c", x: 190, y: 0, type: "entrance-tenant" },
        { id: "c", x: 200, y: 0,  type: "store", store: "c" },
        { id: "d", x: 100, y: 50, type: "junction" },
      ],
      edges: [
        { a: "a", b: "b", cost: 100 },
        { a: "b", b: "ent-c", cost: 90 },
        { a: "ent-c", b: "c", cost: 10 },
        { a: "a", b: "d", cost: 500 },
        { a: "d", b: "ent-c", cost: 500 },
      ],
    });
    const r = route(g, "a", "c");
    expect(r!.path).toEqual(["a", "b", "ent-c", "c"]);
    expect(r!.cost).toBe(200);
  });

  it("routeBetweenStores trims store-centroid endpoints (route ends at entrance)", () => {
    // Pattern: store-a-centroid ─ entrance-a ─ junction ─ entrance-b ─ store-b-centroid
    // The polyline rendered should not enter the store polygon — i.e.
    // the trimmed path should start at entrance-a and end at entrance-b,
    // never touching the centroid nodes.
    const g = buildGraph({
      nodes: [
        { id: "store-a",    x: 0,   y: 10, type: "store", store: "store-a" },
        { id: "entrance-a", x: 10,  y: 0,  type: "entrance-tenant" },
        { id: "j-1",        x: 100, y: 0,  type: "junction" },
        { id: "entrance-b", x: 190, y: 0,  type: "entrance-tenant" },
        { id: "store-b",    x: 200, y: 10, type: "store", store: "store-b" },
      ],
      edges: [
        { a: "store-a",    b: "entrance-a", cost: 14 },
        { a: "entrance-a", b: "j-1",        cost: 90 },
        { a: "j-1",        b: "entrance-b", cost: 90 },
        { a: "entrance-b", b: "store-b",    cost: 14 },
      ],
    });
    const r = routeBetweenStores(g, "store-a", "store-b");
    expect(r).not.toBeNull();
    // Centroid endpoints dropped from BOTH path and points.
    expect(r!.path).toEqual(["entrance-a", "j-1", "entrance-b"]);
    expect(r!.points).toEqual([[10, 0], [100, 0], [190, 0]]);
  });

  it("routeBetweenStores prefers the entrance-tenant neighbor over a shorter junction-bridge", () => {
    // Real-world case: autoconnect added a direct centroid↔junction
    // bridge that's geometrically shortest, but the operator placed
    // an entrance-tenant on the OTHER side of the polygon. A naive
    // route ends at the junction (wrong side). The contract is that
    // every store's route terminates at the operator-placed
    // entrance-tenant when one exists.
    //
    //   store-a ─── entrance-a ─── j-1 ─── j-2 ─── entrance-b ─── store-b
    //      └─────── j-shortcut ──────────────┘
    // The shortcut from store-b to j-shortcut is cheaper than going
    // store-b → entrance-b → j-2, so a naive shortest-path picks the
    // shortcut and trims store-b, ending at j-shortcut (wrong side).
    const g = buildGraph({
      nodes: [
        { id: "store-a",    x: 0,   y: 10, type: "store", store: "store-a" },
        { id: "entrance-a", x: 10,  y: 0,  type: "entrance-tenant" },
        { id: "j-1",        x: 100, y: 0,  type: "junction" },
        { id: "j-2",        x: 150, y: 0,  type: "junction" },
        { id: "entrance-b", x: 190, y: 0,  type: "entrance-tenant" },
        { id: "j-shortcut", x: 210, y: 50, type: "junction" },
        { id: "store-b",    x: 200, y: 10, type: "store", store: "store-b" },
      ],
      edges: [
        { a: "store-a",    b: "entrance-a", cost: 14 },
        { a: "entrance-a", b: "j-1",        cost: 90 },
        { a: "j-1",        b: "j-2",        cost: 50 },
        { a: "j-2",        b: "entrance-b", cost: 40 },
        { a: "entrance-b", b: "store-b",    cost: 14 },
        { a: "j-1",        b: "j-shortcut", cost: 20 },
        { a: "j-shortcut", b: "store-b",    cost: 41 },
      ],
    });
    const r = routeBetweenStores(g, "store-a", "store-b");
    expect(r).not.toBeNull();
    // Must end at the operator-placed entrance, NOT j-shortcut.
    expect(r!.path.at(-1)).toBe("entrance-b");
    expect(r!.path[0]).toBe("entrance-a");
  });

  it("routeBetweenStores doesn't trim if the centroid is the only node (single-store edge)", () => {
    // Degenerate: a store with only one edge — to itself? trivial graph.
    // routeBetweenStores from store-a to store-a → null (no real route).
    const g = buildGraph({
      nodes: [{ id: "store-a", x: 0, y: 0, type: "store", store: "store-a" }],
      edges: [],
    });
    expect(routeBetweenStores(g, "store-a", "store-a")).toBeNull();
  });

  it("buildGraph drops edges that cross an operator-drawn barrier", () => {
    // Fixture: A — B short direct edge, plus a detour A — C — B that's
    // longer. A barrier line is drawn across the A—B segment. The
    // direct A—B edge must be excluded from the built graph, forcing
    // the route to detour A → C → B.
    //
    //   A ────────── B   (direct, cheap, but crossed by barrier)
    //    \          /
    //     C ────────       (detour, more expensive but barrier-free)
    //
    const g = buildGraph({
      nodes: [
        { id: "a", x: 0,   y: 0,   type: "junction" },
        { id: "b", x: 100, y: 0,   type: "junction" },
        { id: "c", x: 50,  y: 100, type: "junction" },
      ],
      edges: [
        { a: "a", b: "b", cost: 100 }, // direct, blocked
        { a: "a", b: "c", cost: 112 },
        { a: "c", b: "b", cost: 112 },
      ],
      // Barrier crosses the A—B segment (a horizontal line at y=0)
      // at x=50 by running vertically through (50, -10) → (50, 10).
      barriers: [
        { id: "bar-1", a: [50, -10], b: [50, 10] },
      ],
    } as any);
    const r = route(g, "a", "b");
    expect(r).not.toBeNull();
    // Must take the detour through C, not the direct edge.
    expect(r!.path).toEqual(["a", "c", "b"]);
  });

  it("buildGraph keeps edges that don't cross any barrier", () => {
    // Same fixture as above, but the barrier is far away — both edges
    // should be intact and A* picks the cheap direct edge.
    const g = buildGraph({
      nodes: [
        { id: "a", x: 0,   y: 0,   type: "junction" },
        { id: "b", x: 100, y: 0,   type: "junction" },
        { id: "c", x: 50,  y: 100, type: "junction" },
      ],
      edges: [
        { a: "a", b: "b", cost: 100 },
        { a: "a", b: "c", cost: 112 },
        { a: "c", b: "b", cost: 112 },
      ],
      barriers: [
        { id: "far", a: [500, 500], b: [600, 600] },
      ],
    } as any);
    const r = route(g, "a", "b");
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(["a", "b"]);
  });

  it("south-common-orthopedic → nofrills is a short walk, not a stroll through the mall", () => {
    // Operator on-site (2026-05-25) confirmed SCO and NoFrills are
    // a "short walk out the front door" apart. Direct distance
    // between their entrances is ~118 px. Anything routing through
    // a long chain of unrelated stores/junctions means the entrance
    // nodes aren't wired to the courtyard walkway.
    const g = buildGraph(graph as any);
    const r = routeBetweenStores(g, "south-common-orthopedic", "nofrills");
    expect(r).not.toBeNull();
    expect(r!.cost).toBeLessThan(250);
    expect(r!.path.length).toBeLessThan(10);
  });

  it("routeBetweenStores avoids entrance-main nodes when an indoor path exists", () => {
    // Operator rule: someone already in the mall should stay in the
    // mall. If A* could route tenant→tenant by stepping out a main
    // entrance and back in, the longer all-indoor path wins.
    //
    //   entry-a ── main-1 ──── main-2 ── entry-b     (cheap "outside")
    //      │                                  │
    //      └──── indoor-1 ────────────────────┘     (expensive but indoor)
    //
    const g = buildGraph({
      nodes: [
        { id: "store-a",  x: 0,   y: 0,    type: "store", store: "store-a" },
        { id: "entry-a",  x: 10,  y: 0,    type: "entrance-tenant" },
        { id: "main-1",   x: 10,  y: -5,   type: "entrance-main" },
        { id: "main-2",   x: 110, y: -5,   type: "entrance-main" },
        { id: "entry-b",  x: 110, y: 0,    type: "entrance-tenant" },
        { id: "store-b",  x: 120, y: 0,    type: "store", store: "store-b" },
        { id: "indoor-1", x: 60,  y: 100,  type: "junction" },
      ],
      edges: [
        { a: "store-a",  b: "entry-a",  cost: 10 },
        { a: "entry-a",  b: "main-1",   cost: 5 },
        { a: "main-1",   b: "main-2",   cost: 100 },
        { a: "main-2",   b: "entry-b",  cost: 5 },
        { a: "entry-b",  b: "store-b",  cost: 10 },
        // Indoor detour through a courtyard junction (much longer).
        { a: "entry-a",  b: "indoor-1", cost: 120 },
        { a: "indoor-1", b: "entry-b",  cost: 120 },
      ],
    });
    const r = routeBetweenStores(g, "store-a", "store-b");
    expect(r).not.toBeNull();
    // No entrance-main on the path.
    expect(r!.path).not.toContain("main-1");
    expect(r!.path).not.toContain("main-2");
    expect(r!.path).toContain("indoor-1");
  });

  it("routeBetweenStores falls back to entrance-main if no indoor path exists", () => {
    // Two tenants only reachable via a main entrance. With no
    // all-indoor alternative, routing through the entrance is the
    // only way — the rule is a preference, not a hard wall.
    const g = buildGraph({
      nodes: [
        { id: "store-a", x: 0,   y: 0,  type: "store", store: "store-a" },
        { id: "entry-a", x: 10,  y: 0,  type: "entrance-tenant" },
        { id: "main",    x: 60,  y: 0,  type: "entrance-main" },
        { id: "entry-b", x: 110, y: 0,  type: "entrance-tenant" },
        { id: "store-b", x: 120, y: 0,  type: "store", store: "store-b" },
      ],
      edges: [
        { a: "store-a", b: "entry-a", cost: 10 },
        { a: "entry-a", b: "main",    cost: 50 },
        { a: "main",    b: "entry-b", cost: 50 },
        { a: "entry-b", b: "store-b", cost: 10 },
      ],
    });
    const r = routeBetweenStores(g, "store-a", "store-b");
    expect(r).not.toBeNull();
    expect(r!.path).toContain("main");
  });

  it("buildGraph drops edges that cut through a foreign tenant polygon", () => {
    // The wayfinder must never route over a wall. A foreign tenant's
    // polygon is a wall — even if an edge was drawn straight through
    // it (a tracing mistake), the route should detour around.
    //
    //   A ───────────── B   (direct, but crosses a foreign polygon)
    //    \             /
    //     C ────────────    (detour, clean)
    //
    // Polygon "foreign" has corners (40,-30) (40,30) (60,30) (60,-30)
    // — a 20×60 box centered on the A-B segment.
    const g = buildGraph({
      nodes: [
        { id: "a", x: 0,   y: 0,   type: "junction" },
        { id: "b", x: 100, y: 0,   type: "junction" },
        { id: "c", x: 50,  y: 100, type: "junction" },
      ],
      edges: [
        { a: "a", b: "b", cost: 100 },
        { a: "a", b: "c", cost: 112 },
        { a: "c", b: "b", cost: 112 },
      ],
      polygons: [
        {
          store_id: "foreign",
          ring: [[40, -30], [60, -30], [60, 30], [40, 30], [40, -30]],
        },
      ],
    } as any);
    const r = route(g, "a", "b");
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(["a", "c", "b"]);
  });

  it("buildGraph allows an edge to cross its own store's polygon", () => {
    // The store-centroid → entrance edge legitimately crosses the
    // store's OWN polygon boundary (centroid is inside, entrance is
    // at the door). Polygon-filtering must whitelist owner edges.
    const g = buildGraph({
      nodes: [
        { id: "shop",    x: 50, y: 50, type: "store", store: "shop" },
        { id: "entry",   x: 50, y: 0,  type: "entrance-tenant" },
      ],
      edges: [{ a: "shop", b: "entry", cost: 50 }],
      polygons: [
        {
          store_id: "shop",
          ring: [[40, 30], [60, 30], [60, 70], [40, 70], [40, 30]],
        },
      ],
    } as any);
    const r = route(g, "shop", "entry");
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(["shop", "entry"]);
  });

  it("buildGraph drops store-to-junction edges (visitors enter only at an entrance)", () => {
    // Standalone "island" tenants (BMO, TD, Rogers) sometimes get an
    // autoconnect bridge directly from their centroid to the nearest
    // courtyard junction. That bridge exits the tenant polygon at a
    // random point on the wall — visitors aren't actually getting in
    // there. From a store node, only edges to entrance-* are valid.
    const g = buildGraph({
      nodes: [
        { id: "store-a", x: 0,  y: 0, type: "store", store: "store-a" },
        { id: "j-1",     x: 50, y: 0, type: "junction" },
      ],
      edges: [{ a: "store-a", b: "j-1", cost: 50 }],
    });
    expect(route(g, "store-a", "j-1")).toBeNull();
  });

  it("buildGraph keeps store-to-entrance-tenant edges (the legit door)", () => {
    const g = buildGraph({
      nodes: [
        { id: "store-a", x: 0,  y: 0, type: "store", store: "store-a" },
        { id: "ent-a",   x: 10, y: 0, type: "entrance-tenant" },
      ],
      edges: [{ a: "store-a", b: "ent-a", cost: 10 }],
    });
    const r = route(g, "store-a", "ent-a");
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(["store-a", "ent-a"]);
  });

  it("buildGraph drops store-to-store edges (they always cross a wall)", () => {
    // Two adjacent tenants directly connected centroid-to-centroid
    // is a wall-crossing by construction — the segment goes from
    // inside one polygon to inside another. Autoconnect adds these
    // as fallbacks; pathfind must refuse to use them.
    //
    //   store-a ── store-b   (illegal, both endpoints are centroids)
    //
    // Without an entrance/junction path, A* should return null.
    const g = buildGraph({
      nodes: [
        { id: "store-a", x: 0,   y: 0, type: "store", store: "store-a" },
        { id: "store-b", x: 100, y: 0, type: "store", store: "store-b" },
      ],
      edges: [{ a: "store-a", b: "store-b", cost: 100 }],
    });
    expect(route(g, "store-a", "store-b")).toBeNull();
  });

  it("returns null when no path exists", () => {
    const g = buildGraph({
      nodes: [
        { id: "a", x: 0,  y: 0,  type: "junction" },
        { id: "b", x: 10, y: 10, type: "junction" },
      ],
      edges: [],
    });
    expect(route(g, "a", "b")).toBeNull();
  });

});
