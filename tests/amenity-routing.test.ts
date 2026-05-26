import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGraph, routeBetweenStores } from "../src/lib/pathfind";

/**
 * Routing to/from the washroom + security amenities was broken
 * because:
 *
 *   1. Their `type:"store"` nodes sat at stale leftover positions
 *      (washroom at 696,280; security at 615,135) that didn't
 *      match the user-placed centroids in stores.json
 *      (459.4,765.2 and 425.4,813.4 respectively). The map drew
 *      the icons at the centroid but routes terminated at the
 *      stale stub.
 *   2. The store-type amenity nodes connected to other stores
 *      (a1donuts, unit-19) instead of corridor junctions, which
 *      `isStoreSideExit` filters out as wall-crossings.
 *
 * Contract:
 *   - The `washroom` and `security` graph store nodes must sit at
 *     the centroids declared in stores.json (±5 px).
 *   - Routing from a popular anchor like `a1donuts` to either
 *     amenity must return a non-null path, with the trimmed end
 *     close to the amenity centroid.
 */
describe("amenity routing", () => {
  const graph = JSON.parse(
    readFileSync(resolve(__dirname, "../data/graph.json"), "utf8"),
  );
  const stores = JSON.parse(
    readFileSync(resolve(__dirname, "../data/stores.json"), "utf8"),
  );

  function centroidOf(id: string): [number, number] {
    const s = stores.stores.find((x: any) => x.id === id);
    if (!s) throw new Error(`missing store: ${id}`);
    return s.centroid;
  }
  function graphNode(id: string) {
    return graph.nodes.find((n: any) => n.id === id);
  }

  it("washroom store node sits at the stores.json centroid", () => {
    const [cx, cy] = centroidOf("washroom");
    const n = graphNode("washroom");
    expect(n, "graph node 'washroom' missing").toBeTruthy();
    expect(Math.hypot(n.x - cx, n.y - cy)).toBeLessThan(5);
  });

  it("security store node sits at the stores.json centroid", () => {
    const [cx, cy] = centroidOf("security");
    const n = graphNode("security");
    expect(n, "graph node 'security' missing").toBeTruthy();
    expect(Math.hypot(n.x - cx, n.y - cy)).toBeLessThan(5);
  });

  it("can route from a1donuts to washroom", () => {
    const g = buildGraph(graph);
    const r = routeBetweenStores(g, "a1donuts", "washroom");
    expect(r, "no route a1donuts -> washroom").toBeTruthy();
    expect(r!.path.length).toBeGreaterThan(1);
    const [cx, cy] = centroidOf("washroom");
    const last = r!.points[r!.points.length - 1];
    // Trimmed path ends at the nearest non-store node — should be
    // within ~50px of the washroom centroid.
    expect(Math.hypot(last[0] - cx, last[1] - cy)).toBeLessThan(80);
  });

  it("can route from a1donuts to security", () => {
    const g = buildGraph(graph);
    const r = routeBetweenStores(g, "a1donuts", "security");
    expect(r, "no route a1donuts -> security").toBeTruthy();
    expect(r!.path.length).toBeGreaterThan(1);
    const [cx, cy] = centroidOf("security");
    const last = r!.points[r!.points.length - 1];
    expect(Math.hypot(last[0] - cx, last[1] - cy)).toBeLessThan(80);
  });

  it("can route FROM washroom to a1donuts (origin works as well as destination)", () => {
    const g = buildGraph(graph);
    const r = routeBetweenStores(g, "washroom", "a1donuts");
    expect(r, "no route washroom -> a1donuts").toBeTruthy();
  });
});
