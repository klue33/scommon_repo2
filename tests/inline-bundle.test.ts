import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The fully-inlined Code Injection snippet: paste once into
 * Squarespace and the wayfinder works with zero external CDN
 * dependencies (no jsDelivr, no GitHub fetch). After this, the
 * source repo can go private and the live site keeps working as
 * long as the snippet stays in Code Injection.
 *
 * Contract:
 *   - docs/squarespace-inline-bundle.html ships with the snippet.
 *   - It contains the entire dist/wayfinder.js inlined as a
 *     <script type="module">.
 *   - It contains the entire dist/wayfinder.css inlined as a
 *     <style>.
 *   - It mounts into #scc-wayfinder.
 *   - It exposes a window.SCC_WAYFINDER_CONFIG block with the
 *     five asset URL slots pre-stubbed for the operator to fill
 *     in after uploading the asset files to Squarespace's
 *     File Manager (/s/...).
 *   - It does NOT reference jsDelivr or cdn.jsdelivr.net (the
 *     point of inlining is to eliminate that dependency).
 */
describe("Squarespace inline-bundle snippet", () => {
  const path = resolve(__dirname, "../docs/squarespace-inline-bundle.html");

  it("exists at docs/squarespace-inline-bundle.html", () => {
    expect(existsSync(path)).toBe(true);
  });

  if (!existsSync(path)) return;
  const snippet = readFileSync(path, "utf8");

  it("mounts into #scc-wayfinder", () => {
    expect(snippet).toMatch(/id=["']scc-wayfinder["']/);
  });

  it("inlines the JS bundle (not a remote script tag)", () => {
    expect(snippet).toMatch(/<script\s+type=["']module["']>/);
    // No remote src on a module script.
    expect(snippet).not.toMatch(/<script[^>]*\bsrc=[^>]*wayfinder\.js/);
    // Should carry recognisable bundle bytes (Preact's "preact" runtime
    // exports or one of our own log lines).
    expect(snippet).toMatch(/\[scc-wayfinder\]|SCC_WAYFINDER_CONFIG/);
  });

  it("inlines the CSS bundle", () => {
    expect(snippet).toMatch(/<style[\s>]/);
    expect(snippet).toMatch(/\.scc-wf__viewer|\.scc-wf__/);
  });

  it("provides the five asset URL placeholders in SCC_WAYFINDER_CONFIG", () => {
    expect(snippet).toMatch(/SCC_WAYFINDER_CONFIG/);
    expect(snippet).toMatch(/geojsonUrl/);
    expect(snippet).toMatch(/level1Url/);
    expect(snippet).toMatch(/topClusterUrl/);
    expect(snippet).toMatch(/midClusterUrl/);
    expect(snippet).toMatch(/rightClusterUrl/);
  });

  it("does not reference jsDelivr (point of inlining is to remove it)", () => {
    expect(snippet).not.toMatch(/cdn\.jsdelivr\.net/);
  });

  it("file is hefty — JS+CSS plus markup adds up to >50 KB", () => {
    expect(statSync(path).size).toBeGreaterThan(50 * 1024);
  });
});
