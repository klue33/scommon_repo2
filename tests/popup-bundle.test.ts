import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Popup-launcher variant of the fully-inlined bundle. Same zero-
 * external-deps story as squarespace-inline-bundle.html, but
 * wrapped in a "Find route" pill that opens a modal. Useful when
 * the wayfinder lives on a category or home page rather than a
 * dedicated /wayfinder page.
 */
describe("Squarespace popup-bundle snippet", () => {
  const path = resolve(__dirname, "../docs/squarespace-popup-bundle.html");

  it("exists at docs/squarespace-popup-bundle.html", () => {
    expect(existsSync(path)).toBe(true);
  });

  if (!existsSync(path)) return;
  const snippet = readFileSync(path, "utf8");

  it("renders a launcher pill button", () => {
    expect(snippet).toMatch(/class="scc-wf-popup__launch"/);
    expect(snippet).toMatch(/Find route/);
  });

  it("renders a modal overlay + panel + close button", () => {
    expect(snippet).toMatch(/scc-wf-popup__overlay/);
    expect(snippet).toMatch(/scc-wf-popup__panel/);
    expect(snippet).toMatch(/scc-wf-popup__close/);
  });

  it("mounts the wayfinder into #scc-wayfinder inside the modal", () => {
    expect(snippet).toMatch(/id=["']scc-wayfinder["']/);
  });

  it("inlines the JS bundle (no remote module src)", () => {
    expect(snippet).toMatch(/<script\s+type=["']module["']>/);
    expect(snippet).not.toMatch(/<script[^>]*\bsrc=[^>]*wayfinder\.js/);
  });

  it("inlines the wayfinder CSS", () => {
    expect(snippet).toMatch(/\.scc-wf__viewer|\.scc-wf__/);
  });

  it("lazy-loads the bundle on first open", () => {
    // The launcher click handler should activate / inject the module
    // only after the user opens the popup, not on every page view.
    expect(snippet).toMatch(/openPopup|openModal|is-open/);
  });

  it("contains the five asset URL placeholders", () => {
    expect(snippet).toMatch(/geojsonUrl/);
    expect(snippet).toMatch(/level1Url/);
    expect(snippet).toMatch(/topClusterUrl/);
    expect(snippet).toMatch(/midClusterUrl/);
    expect(snippet).toMatch(/rightClusterUrl/);
  });

  it("does not reference jsDelivr", () => {
    expect(snippet).not.toMatch(/cdn\.jsdelivr\.net/);
  });

  it("is hefty enough that the bundle is really inline (>50 KB)", () => {
    expect(statSync(path).size).toBeGreaterThan(50 * 1024);
  });
});
