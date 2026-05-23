import { describe, it, expect } from "vitest";
import { buildGraph, route } from "@/src/lib/pathfind";
import graph from "@/data/graph.json";

describe("pathfind", () => {
  it("routes from a kiosk to a real tenant", () => {
    const g = buildGraph(graph as any);
    const r = route(g, "kiosk-a", "bmo");
    expect(r).not.toBeNull();
    expect(r!.path[0]).toBe("kiosk-a");
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

  it("can route between the two kiosks (full-site traversal)", () => {
    const g = buildGraph(graph as any);
    const r = route(g, "kiosk-a", "kiosk-b");
    expect(r).not.toBeNull();
    // Must pass through at least one junction.
    expect(r!.path.some((id) => id.startsWith("j-"))).toBe(true);
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

  it("east kiosk reaches Rogers cheaper than west kiosk does", () => {
    const g = buildGraph(graph as any);
    const fromWest = route(g, "kiosk-a", "rogers");
    const fromEast = route(g, "kiosk-b", "rogers");
    expect(fromWest).not.toBeNull();
    expect(fromEast).not.toBeNull();
    expect(fromEast!.cost).toBeLessThan(fromWest!.cost);
    expect(fromEast!.path).toContain("kiosk-b");
    expect(fromWest!.path).not.toContain("kiosk-b");
  });
});
