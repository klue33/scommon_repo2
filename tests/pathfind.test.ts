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
        { id: "j-1",     x: 50,  y: 0,  type: "junction" },
        { id: "j-2",     x: 100, y: 0,  type: "junction" },
        { id: "j-3",     x: 150, y: 0,  type: "junction" },
        { id: "store-2", x: 200, y: 0,  type: "store", store: "store-2" },
      ],
      edges: [
        { a: "store-1", b: "j-1",     cost: 50 },
        { a: "j-1",     b: "j-2",     cost: 50 },
        { a: "j-2",     b: "j-3",     cost: 50 },
        { a: "j-3",     b: "store-2", cost: 50 },
      ],
    });
    const r = route(g, "store-1", "store-2");
    expect(r).not.toBeNull();
    expect(r!.path).toEqual(["store-1", "j-1", "j-2", "j-3", "store-2"]);
    expect(r!.cost).toBe(200);
    // Polyline points follow every node in order — never skip a
    // node — so the rendered route IS the graph edges.
    expect(r!.points).toEqual([
      [0, 0], [50, 0], [100, 0], [150, 0], [200, 0],
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
        { id: "c", x: 200, y: 0,  type: "store", store: "c" },
        { id: "d", x: 100, y: 50, type: "junction" },
      ],
      edges: [
        { a: "a", b: "b", cost: 100 },
        { a: "b", b: "c", cost: 100 },
        { a: "a", b: "d", cost: 500 },
        { a: "d", b: "c", cost: 500 },
      ],
    });
    const r = route(g, "a", "c");
    expect(r!.path).toEqual(["a", "b", "c"]);
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

  it("routeBetweenStores doesn't trim if the centroid is the only node (single-store edge)", () => {
    // Degenerate: a store with only one edge — to itself? trivial graph.
    // routeBetweenStores from store-a to store-a → null (no real route).
    const g = buildGraph({
      nodes: [{ id: "store-a", x: 0, y: 0, type: "store", store: "store-a" }],
      edges: [],
    });
    expect(routeBetweenStores(g, "store-a", "store-a")).toBeNull();
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
