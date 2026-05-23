import { describe, it, expect } from "vitest";
import { isOpenAt } from "@/src/lib/hours";

const mallStore = { id: "x", name: "X", unit: "U", floor: 1, category: "c", hours: "mall" } as any;
const customStore = { id: "y", name: "Y", unit: "U", floor: 1, category: "c", hours: { mon_fri: "09:30-17:00", sat: "09:30-16:00", sun: "closed" } } as any;

describe("isOpenAt", () => {
  it("mall-hours store is open midday Tuesday", () => {
    // 2026-05-26 is a Tuesday
    expect(isOpenAt(mallStore, new Date("2026-05-26T14:00:00"))).toBe(true);
  });

  it("mall-hours store is closed at 6am", () => {
    expect(isOpenAt(mallStore, new Date("2026-05-26T06:00:00"))).toBe(false);
  });

  it("custom store closed on Sunday", () => {
    // 2026-05-24 is a Sunday
    expect(isOpenAt(customStore, new Date("2026-05-24T12:00:00"))).toBe(false);
  });

  it("custom store open Saturday morning, closed Saturday late", () => {
    // 2026-05-23 is a Saturday
    expect(isOpenAt(customStore, new Date("2026-05-23T10:00:00"))).toBe(true);
    expect(isOpenAt(customStore, new Date("2026-05-23T17:00:00"))).toBe(false);
  });
});
