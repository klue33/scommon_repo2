import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * window.SCC_WAYFINDER_CONFIG can pin where the bundle pulls its
 * assets from. Important when jsDelivr is stale or when the operator
 * wants to host site.geojson + surroundings.svg on their own server.
 *
 * The override pattern: if the config key is present, use it as-is;
 * otherwise resolve relative to import.meta.url (the bundle URL).
 */
describe("MapViewer config overrides", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  it("reads window.SCC_WAYFINDER_CONFIG.geojsonUrl as an override", () => {
    expect(src).toMatch(/SCC_WAYFINDER_CONFIG[\s\S]{0,200}geojsonUrl/);
  });

  it("falls back to import.meta.url-relative path for geojson", () => {
    expect(src).toMatch(/new URL\(\s*["']\.\/maps\/site\.geojson["']\s*,\s*import\.meta\.url/);
  });

  it("reads window.SCC_WAYFINDER_CONFIG.surroundingsUrl as an override", () => {
    expect(src).toMatch(/SCC_WAYFINDER_CONFIG[\s\S]{0,400}surroundingsUrl|cfg\.surroundingsUrl/);
  });

  it("falls back to import.meta.url-relative path for surroundings.svg", () => {
    expect(src).toMatch(/new URL\(\s*["']\.\/maps\/surroundings\.svg["']\s*,\s*import\.meta\.url/);
  });
});
