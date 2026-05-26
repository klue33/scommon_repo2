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

  it("is well-formed XML (no Illustrator-mangled attributes)", async () => {
    // <image href="…"> on Squarespace/Chrome/Firefox loads SVGs
    // through the XML parser, which chokes on the original asset's
    // mangled attributes like:
    //   class="fill="none";stroke:="#FFFFFF";stroke-width="20";"
    //   class=fill="#BCBCBC"
    //   fill="#DCDBDB";
    // We sanitize the SVG at vendor time. None of those patterns
    // should survive into the file we ship.
    const text = readFileSync(publicPath, "utf8");
    expect(text).not.toMatch(/class="fill=/);
    expect(text).not.toMatch(/class=fill=/);
    expect(text).not.toMatch(/stroke:=/);
    expect(text).not.toMatch(/fill="[^"]*";/);
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

  it("places the backdrop at 2x scale centered on the building (per the original wayfinder CSS)", () => {
    // The original southcommoncentre.ca wayfinder rendered
    // surroundings.svg in a wrapper TWICE the size of the mall map
    // (.surroundings = 192vmin x 128vmin around a 96 x 64vmin mall),
    // centered on the same point. Our viewer mirrors that — anything
    // smaller and the parking lot is clipped to a tiny strip above
    // the building.
    const src = readFileSync(
      resolve(__dirname, "../src/components/MapViewer.tsx"),
      "utf8",
    );
    // Width must be 2x the SVG's intrinsic 1200 -> 2400.
    expect(src).toMatch(/width=\{?\s*2400\s*\}?/);
    expect(src).toMatch(/height=\{?\s*1600\s*\}?/);
    // x must be negative (image extends left of viewBox origin),
    // because 2x scale around centre 600 puts x at -600.
    expect(src).toMatch(/<image[\s\S]*?x=\{?\s*-600\s*\}?/);
  });
});
