import { describe, it, expect } from "vitest";
import { buildGraph, route } from "@/src/lib/pathfind";
import graph from "@/data/graph.json";

// Resolve kiosk IDs from the production graph at runtime so the
// tests don't break when the graph is re-traced under new IDs.
// (The site is a single-level outdoor power centre with 2 kiosks.)
const kiosks = (graph.nodes as any[]).filter((n) => n.type === "kiosk");
const KIOSK_A = kiosks[0]?.id;
const KIOSK_B = kiosks[1]?.id;

// Graph is hand-traced in the live editor at
// http://127.0.0.1:3100/?edit=1 — these integration tests
// assume kiosks are connected to the store network. They are
// skipped while the graph is still being authored. Un-skip
// (s/it.skip/it/) once `tests/graph-health.test.ts` reports a
// single connected component.

describe("pathfind", () => {
  it("the production graph has at least two kiosks", () => {
    expect(KIOSK_A).toBeDefined();
    expect(KIOSK_B).toBeDefined();
    expect(KIOSK_A).not.toBe(KIOSK_B);
  });

  it.skip("routes from a kiosk to a real tenant", () => {
    const g = buildGraph(graph as any);
    const r = route(g, KIOSK_A, "bmo");
    expect(r).not.toBeNull();
    expect(r!.path[0]).toBe(KIOSK_A);
    expect(r!.path.at(-1)).toBe("bmo");
    expect(r!.points.length).toBeGreaterThan(1);
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

  it.skip("can route between the two kiosks (full-site traversal)", () => {
    const g = buildGraph(graph as any);
    const r = route(g, KIOSK_A, KIOSK_B);
    expect(r).not.toBeNull();
    // Must pass through at least one non-kiosk waypoint.
    expect(r!.path.length).toBeGreaterThan(2);
    const kioskIds = new Set([KIOSK_A, KIOSK_B]);
    expect(r!.path.slice(1, -1).every((id) => !kioskIds.has(id))).toBe(true);
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

  it.skip("the closer kiosk reaches Rogers more cheaply than the farther one", () => {
    // Rogers is at the east edge — the east kiosk should win the
    // shorter route by virtue of position alone. The test doesn't
    // assume which graph-id is "east" — it picks the kiosk with the
    // larger x coordinate as "east" and checks the cost ordering.
    const g = buildGraph(graph as any);
    const eastKiosk = kiosks.reduce((a, b) => (a.x >= b.x ? a : b));
    const westKiosk = kiosks.reduce((a, b) => (a.x <= b.x ? a : b));
    const fromWest = route(g, westKiosk.id, "rogers");
    const fromEast = route(g, eastKiosk.id, "rogers");
    expect(fromWest).not.toBeNull();
    expect(fromEast).not.toBeNull();
    expect(fromEast!.cost).toBeLessThanOrEqual(fromWest!.cost);
  });
});
