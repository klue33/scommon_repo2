import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The level-1.svg backdrop's top-middle (road sign) and top-right
 * (NE parking + signage) clusters are split out into their own
 * SVG files so the operator can drag each cluster independently in
 * tuner mode. Each cluster gets its own offset state and its own
 * pointer-drag handler — same plumbing as the base backdrop drag.
 */
describe("draggable top / mid / right SVG clusters", () => {
  const top = resolve(__dirname, "../public/maps/level-1-cluster-top.svg");
  const mid = resolve(__dirname, "../public/maps/level-1-cluster-mid.svg");
  const right = resolve(__dirname, "../public/maps/level-1-cluster-right.svg");
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  it("ships the three cluster SVG assets", () => {
    expect(existsSync(top), "missing level-1-cluster-top.svg").toBe(true);
    expect(existsSync(mid), "missing level-1-cluster-mid.svg").toBe(true);
    expect(existsSync(right), "missing level-1-cluster-right.svg").toBe(true);
  });

  it("exposes per-cluster offset state", () => {
    expect(src).toMatch(/setMidOffsetX|midOffsetX[\s\S]{0,200}useState/);
    expect(src).toMatch(/setRightOffsetX|rightOffsetX[\s\S]{0,200}useState/);
    expect(src).toMatch(/setMidOffsetY/);
    expect(src).toMatch(/setRightOffsetY/);
  });

  it("renders cluster-mid + cluster-right <image> elements with pointer drag", () => {
    expect(src).toMatch(/level-1-cluster-mid\.svg|midClusterUrl/);
    expect(src).toMatch(/level-1-cluster-right\.svg|rightClusterUrl/);
    // Each cluster image must be wired with onPointerDown gated on showTuner.
    const dragHooks = (src.match(/onPointerDown=\{showTuner/g) ?? []).length;
    expect(dragHooks, `expected four drag handlers (base + 3 clusters), got ${dragHooks}`).toBeGreaterThanOrEqual(4);
  });

  it("tuner panel surfaces inputs for top / mid / right offsets", () => {
    expect(src).toMatch(/>Top X</);
    expect(src).toMatch(/>Mid X</);
    expect(src).toMatch(/>Right X</);
  });
});
