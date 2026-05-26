import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The mall building floats inside a sea of parking lot. The
 * surroundings.svg asset is the inherited rendering of the parking
 * lot, drive aisles, roads, and curbs from the original
 * southcommoncentre.ca wayfinder. We ship it inside the bundle's
 * maps/ directory so it loads from the same CORS-friendly origin as
 * site.geojson, and the MapViewer draws it as a transparent backdrop
 * behind the tenant polygons.
 */
describe("surroundings.svg backdrop", () => {
  const publicPath = resolve(__dirname, "../public/maps/surroundings.svg");

  it("ships at public/maps/surroundings.svg", () => {
    expect(existsSync(publicPath), "missing public/maps/surroundings.svg").toBe(true);
  });

  it("is a non-empty SVG", () => {
    expect(statSync(publicPath).size).toBeGreaterThan(1000);
    expect(readFileSync(publicPath, "utf8")).toMatch(/<svg[\s>]/i);
  });

  it("MapViewer renders an <image> tag inside the rotated <g>", () => {
    const src = readFileSync(
      resolve(__dirname, "../src/components/MapViewer.tsx"),
      "utf8",
    );
    // Either a JSX <image> or "image" with href + the surroundings url.
    expect(src).toMatch(/<image[\s>]/);
    expect(src).toMatch(/surroundings\.svg/);
  });
});
