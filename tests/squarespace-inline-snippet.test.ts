import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract for the Squarespace Code Block inline snippet shipped at
 * docs/squarespace-inline.html. This is the version for the
 * existing /wayfinder page, where the wayfinder IS the page (no
 * launcher button, no modal). Same Squarespace-safety invariants
 * as the popup snippet:
 *   - mount the bundle into #scc-wayfinder (canonical id)
 *   - never an iframe
 *   - declare window.SCC_WAYFINDER_CONFIG (the only allowed global)
 *   - inherit Squarespace's site-style palette
 *   - leave a clear hostable URL placeholder
 * And one extra invariant: the snippet gives the mount node a
 * non-zero height so the wayfinder actually has room to render.
 */
describe("docs/squarespace-inline.html (Code Block snippet)", () => {
  const path = resolve(__dirname, "../docs/squarespace-inline.html");

  it("exists at docs/squarespace-inline.html", () => {
    expect(existsSync(path), "missing copy-pasteable inline snippet file").toBe(true);
  });

  const snippet = existsSync(path) ? readFileSync(path, "utf8") : "";

  it("mounts into #scc-wayfinder", () => {
    expect(snippet).toMatch(/id=["']scc-wayfinder["']/);
  });

  it("never uses an iframe", () => {
    expect(snippet).not.toMatch(/<iframe/i);
  });

  it("gives #scc-wayfinder a non-zero height", () => {
    // Either an inline style="height: ..." with vh/px, or a CSS rule
    // setting height/min-height on #scc-wayfinder. Without this the
    // bundle mounts into a zero-height div and renders invisibly.
    const inline = /id=["']scc-wayfinder["'][^>]*style=["'][^"']*height\s*:\s*[^"';]+/i.test(snippet);
    const cssRule = /#scc-wayfinder\s*\{[^}]*(?:min-)?height\s*:\s*[^;}]+/i.test(snippet);
    expect(
      inline || cssRule,
      "snippet must size #scc-wayfinder so the wayfinder has room to render",
    ).toBe(true);
  });

  it("declares window.SCC_WAYFINDER_CONFIG (the only allowed global)", () => {
    expect(snippet).toMatch(/window\.SCC_WAYFINDER_CONFIG/);
  });

  it("references the wayfinder.js and wayfinder.css assets", () => {
    expect(snippet).toMatch(/wayfinder\.js/);
    expect(snippet).toMatch(/wayfinder\.css/);
  });

  it("leaves a hostable URL placeholder for the operator to fill in", () => {
    expect(snippet).toMatch(/wayfinder\.southcommoncentre\.ca|YOUR-HOST|cdn\.jsdelivr\.net/);
  });

  it("uses jsDelivr (or another CORS-friendly CDN) by default", () => {
    // Squarespace's /s/ uploader doesn't serve ES-module MIME types
    // or CORS headers, so the snippet must default to a host that
    // does. jsDelivr does (off any public GitHub repo).
    expect(snippet).toMatch(/cdn\.jsdelivr\.net\/gh\/[\w-]+\/[\w-]+/);
  });
});
