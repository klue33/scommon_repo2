import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The level-1.svg backdrop was rejected because its parking lot is
 * drawn in 3D perspective — the width at the top isn't equal to the
 * width at the bottom. The original wayfinder also shipped a
 * top-down 2D parking-lot SVG at s/surroundings.svg, with street
 * names baked in as path glyphs. That's what we use as the
 * backdrop instead.
 *
 * Contract:
 *   - public/maps/surroundings.svg ships in the bundle (well-formed
 *     XML, no Illustrator-mangled attributes).
 *   - public/maps/level-1.svg is gone.
 *   - MapViewer renders an <image> whose href derives from
 *     `surroundingsUrl`, not `level1Url`.
 *   - SCC_WAYFINDER_CONFIG.surroundingsUrl is the override knob.
 */
describe("parking-lot (2D top-down) backdrop", () => {
  const svgPath = resolve(__dirname, "../public/maps/surroundings.svg");
  const mapViewer = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  it("ships public/maps/surroundings.svg", () => {
    expect(existsSync(svgPath)).toBe(true);
    expect(statSync(svgPath).size).toBeGreaterThan(1000);
  });

  it("surroundings.svg is well-formed XML (Illustrator attrs sanitized)", () => {
    const text = readFileSync(svgPath, "utf8");
    expect(text).not.toMatch(/class="fill=/);
    expect(text).not.toMatch(/class=fill=/);
    expect(text).not.toMatch(/stroke:=/);
    expect(text).not.toMatch(/fill="[^"]*";/);
  });

  it("public/maps/level-1.svg is removed", () => {
    expect(existsSync(resolve(__dirname, "../public/maps/level-1.svg"))).toBe(false);
  });

  it("MapViewer renders the <image> from surroundingsUrl", () => {
    expect(mapViewer).toMatch(/href=\{surroundingsUrl\}/);
    expect(mapViewer).not.toMatch(/href=\{level1Url\}/);
  });

  it("SCC_WAYFINDER_CONFIG.surroundingsUrl is the override knob", () => {
    expect(mapViewer).toMatch(/cfg\.surroundingsUrl/);
  });
});
