import { describe, it, expect } from "vitest";
import { searchStores } from "@/lib/stores";

const fixture = [
  { id: "winners",   name: "Winners",   unit: "L1-100", floor: 1, category: "apparel",  hours: "mall" },
  { id: "dollarama", name: "Dollarama", unit: "L1-104", floor: 1, category: "general",  hours: "mall" },
  { id: "rogers",    name: "Rogers",    unit: "L2-205", floor: 2, category: "services", hours: "mall" },
] as any;

describe("searchStores", () => {
  it("returns all stores for empty query", () => {
    expect(searchStores("", fixture)).toHaveLength(3);
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
    expect(r.map((s) => s.id)).toContain("rogers");
  });
});
