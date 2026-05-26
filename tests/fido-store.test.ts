import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGraph, routeBetweenStores } from "../src/lib/pathfind";
import { searchStores, STORES } from "../src/lib/stores";

/**
 * Rogers and Fido share unit 12 in the original southcommoncentre.ca
 * directory (data-space 12.1 and 12.2). The first cut of stores.json
 * only carried Rogers, so visitors typing "fido" got zero results.
 * Add Fido as a separate searchable store at the same centroid +
 * route endpoint as Rogers.
 */
describe("Fido shows up in search at the same unit as Rogers", () => {
  const stores = JSON.parse(
    readFileSync(resolve(__dirname, "../data/stores.json"), "utf8"),
  );
  const graph = JSON.parse(
    readFileSync(resolve(__dirname, "../data/graph.json"), "utf8"),
  );

  function find(id: string) {
    return stores.stores.find((s: any) => s.id === id);
  }

  it("stores.json carries a 'fido' entry", () => {
    expect(find("fido"), "missing fido in stores.json").toBeTruthy();
  });

  it("Fido and Rogers share the same centroid (same physical unit)", () => {
    const f = find("fido"), r = find("rogers");
    expect(f.centroid).toEqual(r.centroid);
  });

  it("searching 'fido' returns the Fido store", () => {
    const results = searchStores("fido", STORES);
    expect(results.length, "no results for 'fido'").toBeGreaterThan(0);
    expect(results[0].id).toBe("fido");
  });

  it("can route to Fido from another store", () => {
    const g = buildGraph(graph);
    const r = routeBetweenStores(g, "a1donuts", "fido");
    expect(r, "no route a1donuts -> fido").toBeTruthy();
    expect(r!.path.length).toBeGreaterThan(1);
  });
});
