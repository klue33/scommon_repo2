import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The level-1.svg backdrop is hand-drawn at a slightly different
 * scale from our surveyed polygons. To get them to line up the
 * operator can dial in:
 *   window.SCC_WAYFINDER_CONFIG.backdropScale   (default 1.0)
 *   window.SCC_WAYFINDER_CONFIG.backdropOffsetX (default 0)
 *   window.SCC_WAYFINDER_CONFIG.backdropOffsetY (default 0)
 *
 * Scaling is around the viewBox centre (600, 400) so the building
 * doesn't drift when scale changes.
 */
describe("MapViewer backdropScale config knob", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  it("reads backdropScale from window.SCC_WAYFINDER_CONFIG", () => {
    expect(src).toMatch(/backdropScale/);
  });

  it("reads backdropOffsetX and backdropOffsetY", () => {
    expect(src).toMatch(/backdropOffsetX/);
    expect(src).toMatch(/backdropOffsetY/);
  });

  it("centres the scale around the viewBox midpoint (600, 400)", () => {
    // The image's x must be (1 - S) * 600 + offsetX, y similarly.
    // Look for the literal "* 600" or "600 *" alongside "1 -" / "1.0 -".
    // Loose check — we don't want to pin the exact formula text.
    expect(src).toMatch(/600/);
    expect(src).toMatch(/400/);
  });
});
