import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The wayfinder bundle fetches site.geojson at runtime to draw the
 * tenant polygons. When hosted on a CDN (jsDelivr) and embedded
 * into a Squarespace page, the fetch must target the CDN where
 * the bundle lives — NOT the page's own origin, which doesn't host
 * /maps/site.geojson and 404s silently. The classic bug:
 *
 *   fetch(new URL("/maps/site.geojson", document.baseURI))
 *
 * baseURI is the HTML page's URI, so the request goes to the
 * Squarespace origin. Use the bundle's OWN URL instead:
 *
 *   fetch(new URL("./maps/site.geojson", import.meta.url))
 *
 * which resolves to the same directory the JS was loaded from on
 * any host — Vite dev, jsDelivr, anywhere.
 */
describe("MapViewer geojson fetch base", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  // Strip line-comments and block-comments so the test catches code
  // references only, not explanatory prose.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  it("resolves the geojson URL against import.meta.url, not document.baseURI", () => {
    expect(
      codeOnly,
      "MapViewer must not anchor the geojson fetch on document.baseURI; that points at the embedding page (Squarespace), not the CDN that hosts the bundle.",
    ).not.toMatch(/document\.baseURI/);
    expect(
      codeOnly,
      "Use new URL(\"./maps/site.geojson\", import.meta.url) so the fetch follows wherever the bundle is hosted.",
    ).toMatch(/import\.meta\.url/);
  });
});
