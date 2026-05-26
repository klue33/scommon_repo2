import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Tuner values the operator dialled in on 2026-05-26. Baked in as
 * useState defaults so regular visitors land on the aligned layout
 * without needing ?tune=1 or window.SCC_WAYFINDER_CONFIG overrides.
 *
 * If a future re-extraction of level-1.svg shifts the artwork,
 * these numbers may need redialling — open the page with ?tune=1
 * and copy the new readout.
 */
describe("backdrop tuner defaults baked into MapViewer", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  function defaultFor(key: string): number | null {
    // useState<number>(typeof cfg.<key> === "number" ? cfg.<key> : <N>)
    const re = new RegExp(
      `cfg\\.${key}\\s*===\\s*["']number["']\\s*\\?\\s*cfg\\.${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`,
    );
    const m = src.match(re);
    return m ? parseFloat(m[1]) : null;
  }

  it("backdropScale defaults to 0.95", () => { expect(defaultFor("backdropScale")).toBe(0.95); });
  it("backdropOffsetX defaults to 63", () => { expect(defaultFor("backdropOffsetX")).toBe(63); });
  it("backdropOffsetY defaults to 25", () => { expect(defaultFor("backdropOffsetY")).toBe(25); });
  it("backdropRotation defaults to 0", () => { expect(defaultFor("backdropRotation")).toBe(0); });
  it("topOffsetX defaults to -3", () => { expect(defaultFor("topOffsetX")).toBe(-3); });
  it("topOffsetY defaults to 36", () => { expect(defaultFor("topOffsetY")).toBe(36); });
  it("midOffsetX defaults to 0", () => { expect(defaultFor("midOffsetX")).toBe(0); });
  it("midOffsetY defaults to 0", () => { expect(defaultFor("midOffsetY")).toBe(0); });
  it("rightOffsetX defaults to -5", () => { expect(defaultFor("rightOffsetX")).toBe(-5); });
  it("rightOffsetY defaults to 54.64", () => { expect(defaultFor("rightOffsetY")).toBeCloseTo(54.64, 1); });
});
