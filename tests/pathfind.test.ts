import { describe, it, expect } from "vitest";
import { buildGraph, route } from "@/src/lib/pathfind";
import graph from "@/data/graph.json";

// Resolve kiosk IDs from the production graph at runtime so the
// tests don't break when the graph is re-traced under new IDs.
// Kiosk 2 is currently ignored (no edges) — Kiosk 1 is the only
// operative kiosk. Tests treat the first kiosk-typed node as
// "the kiosk".
const kiosks = (graph.nodes as any[]).filter((n) => n.type === "kiosk");
const KIOSK_A = kiosks[0]?.id;

// Graph is hand-traced in the live editor at
// http://127.0.0.1:3100/?edit=1 — these integration tests
// assume kiosks are connected to the store network. They are
// skipped while the graph is still being authored. Un-skip
// (s/it.skip/it/) once `tests/graph-health.test.ts` reports a
// single connected component.

describe("pathfind", () => {
  it("the production graph has at least one kiosk", () => {
    expect(KIOSK_A).toBeDefined();
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
