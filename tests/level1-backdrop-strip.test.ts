import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The level-1 floor plan we ship as the backdrop must not draw its
 * own tenant cells — those visually conflict with the polygons our
 * route engine draws on top. After stripping, the SVG should still
 * carry the parking lot, drive aisles, building outline, and
 * decorations, but no rectangular/polygonal "unit fill" cells.
 *
 * Implementation contract: any element carrying `class="map__space"`
 * (the original wayfinder's tenant-fill marker) or a `data-space=`
 * attribute is a tenant cell and must be absent from the shipped
 * level-1.svg.
 */
describe("level-1.svg has tenant cells stripped", () => {
  const p = resolve(__dirname, "../public/maps/level-1.svg");

  it("ships at public/maps/level-1.svg", () => {
    expect(existsSync(p)).toBe(true);
  });

  const svg = readFileSync(p, "utf8");

  it("contains no map__space class fills", () => {
    expect(svg).not.toMatch(/class="map__space"/);
  });

  it("contains no data-space tenant markers", () => {
    expect(svg).not.toMatch(/\bdata-space=/);
  });

  it("still carries the parking lot artwork (path count > 100)", () => {
    // Sanity guard: the original SVG has ~406 <path> elements (the
    // parking-lot stripes, building edges, road lines etc.). After
    // we strip tenant cells we should keep well over 100 paths.
    // If this drops near zero, we've removed too much.
    const paths = (svg.match(/<path\b/g) ?? []).length;
    expect(paths).toBeGreaterThan(100);
  });
});
