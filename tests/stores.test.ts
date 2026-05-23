import { describe, it, expect } from "vitest";
import { searchStores } from "@/src/lib/stores";

const fixture = [
  { id: "winners",   name: "Winners",   unit: "100", category: "apparel",     hours: "mall" },
  { id: "dollarama", name: "Dollarama", unit: "104", category: "general",     hours: "mall" },
  { id: "rogers",    name: "Rogers",    unit: "205", category: "services",    hours: "mall" },
  { id: "five-guys", name: "Five Guys", unit: "300", category: "restaurants", hours: "mall" },
] as any;

describe("searchStores", () => {
  it("returns all stores for empty query", () => {
    expect(searchStores("", fixture)).toHaveLength(4);
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
    const r = searchStores("restaurants", fixture);
    expect(r.map((s) => s.id)).toContain("five-guys");
  });

  it("matches on word-start across multi-word names", () => {
    const r = searchStores("guys", fixture);
    expect(r[0].id).toBe("five-guys");
  });
});
