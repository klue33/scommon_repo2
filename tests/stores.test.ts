import { describe, it, expect } from "vitest";
import { searchStores, STORES } from "@/src/lib/stores";

// Local fixture so the unit-search ranking is exercised against a
// known small set. Names mirror real SCC tenants but kept small.
const fixture = [
  { id: "dollarama", name: "Dollarama",      unit: "47", category: "anchor" },
  { id: "bmo",       name: "BMO",            unit: "11", category: "services" },
  { id: "rogers",    name: "Rogers",         unit: "5",  category: "services" },
  { id: "subway",    name: "Subway",         unit: "8",  category: "restaurants" },
  { id: "td",        name: "TD Bank",        unit: "12", category: "services" },
] as any;

describe("searchStores (fixture)", () => {
  it("returns all stores for empty query", () => {
    expect(searchStores("", fixture)).toHaveLength(5);
  });

  it("ranks exact match first", () => {
    const r = searchStores("rogers", fixture);
    expect(r[0].id).toBe("rogers");
  });

  it("ranks prefix above substring", () => {
    const r = searchStores("doll", fixture);
    expect(r[0].id).toBe("dollarama");
  });

  it("matches by category when no name hit", () => {
    const r = searchStores("services", fixture);
    expect(r.map((s) => s.id)).toEqual(expect.arrayContaining(["bmo", "rogers", "td"]));
  });

  it("matches on word-start across multi-word names", () => {
    const r = searchStores("bank", fixture);
    expect(r[0].id).toBe("td");
  });
});

describe("searchStores (real catalogue)", () => {
  it("finds Walmart by prefix", () => {
    const r = searchStores("walmart");
    expect(r[0]?.name.toLowerCase().startsWith("walmart")).toBe(true);
  });

  it("the catalogue is non-empty and includes anchors", () => {
    expect(STORES.length).toBeGreaterThan(20);
    const cats = new Set(STORES.map((s) => s.category));
    expect(cats.has("anchor")).toBe(true);
    expect(cats.has("restaurants")).toBe(true);
  });
});
