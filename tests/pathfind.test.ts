import { describe, it, expect } from "vitest";
import { buildGraph, route } from "@/lib/pathfind";
import l1 from "@/data/graph.l1.json";
import l2 from "@/data/graph.l2.json";

const floors = [l1 as any, l2 as any];

describe("pathfind", () => {
  it("routes within a floor", () => {
    const g = buildGraph(floors);
    const r = route(g, "l1-kiosk-a", "l1-bmo");
    expect(r).not.toBeNull();
    expect(r!.path[0]).toBe("l1-kiosk-a");
    expect(r!.path.at(-1)).toBe("l1-bmo");
    expect(r!.segments).toHaveLength(1);
    expect(r!.segments[0].floor).toBe(1);
  });

  it("routes across floors via escalator", () => {
    const g = buildGraph(floors);
    const r = route(g, "l1-kiosk-a", "l2-cellmax");
    expect(r).not.toBeNull();
    expect(r!.segments.map((s) => s.floor)).toEqual([1, 2]);
  });

  it("accessible mode avoids escalators", () => {
    const g = buildGraph(floors);
    const r = route(g, "l1-kiosk-a", "l2-cellmax", { accessible: true });
    expect(r).not.toBeNull();
    // Path must include the elevator pair, not escalator.
    expect(r!.path).toContain("l1-elev-1");
    expect(r!.path).toContain("l2-elev-1");
    expect(r!.path).not.toContain("l1-esc-1");
  });

  it("returns null when no path exists", () => {
    const g = buildGraph([
      { floor: 1, nodes: [{ id: "a", x: 0, y: 0, type: "junction" }, { id: "b", x: 10, y: 10, type: "junction" }], edges: [] },
    ]);
    expect(route(g, "a", "b")).toBeNull();
  });
});
