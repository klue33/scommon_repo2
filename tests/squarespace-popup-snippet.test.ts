import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract for the Squarespace Code Block popup snippet shipped at
 * docs/squarespace-popup.html. Squarespace pages share the global
 * DOM with the rest of the site template, so the snippet must:
 *   - mount the bundle into #scc-wayfinder (the canonical id)
 *   - scope every custom CSS selector under .scc-wf-popup so it
 *     can't bleed into the Squarespace template
 *   - never use an iframe (CLAUDE.md non-negotiable)
 *   - lazy-load the bundle only on first open (page weight)
 *   - reference Squarespace's site-style HSL vars (--accent-hsl, etc.)
 *     with sensible fallbacks so it renders even outside a Color Block
 *   - leave a hostable URL placeholder for wayfinder.js + .css
 */
describe("docs/squarespace-popup.html (Code Block snippet)", () => {
  const path = resolve(__dirname, "../docs/squarespace-popup.html");

  it("exists at docs/squarespace-popup.html", () => {
    expect(existsSync(path), "missing copy-pasteable snippet file").toBe(true);
  });

  const snippet = existsSync(path) ? readFileSync(path, "utf8") : "";

  it("mounts into #scc-wayfinder", () => {
    expect(snippet).toMatch(/id=["']scc-wayfinder["']/);
  });

  it("never uses an iframe", () => {
    expect(snippet).not.toMatch(/<iframe/i);
  });

  it("scopes every custom CSS rule under .scc-wf-popup", () => {
    const styleStart = snippet.indexOf("<style");
    const styleEnd = snippet.lastIndexOf("</style>");
    expect(styleStart, "<style> block missing").toBeGreaterThan(-1);
    expect(styleEnd, "</style> block missing").toBeGreaterThan(styleStart);
    const styleBody = snippet.slice(styleStart, styleEnd);
    // Find every selector head (lines that end in `{`). Each must
    // either be a .scc-wf-popup-prefixed selector, a wrapped child
    // selector (.scc-wf-popup foo bar), or a @rule / comment.
    const lines = styleBody.split("\n");
    const offenders: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.endsWith("{")) continue;
      if (line.startsWith("@")) continue;
      // ignore comment lines that happen to end with {
      if (line.startsWith("/*") || line.startsWith("//")) continue;
      const selector = line.slice(0, -1).trim();
      // Allow ".scc-wf-popup..." at any position in the selector list
      const parts = selector.split(",").map((s) => s.trim());
      for (const p of parts) {
        if (!p.includes(".scc-wf-popup")) offenders.push(selector);
      }
    }
    expect(offenders, `unscoped CSS selectors: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("loads the bundle lazily (only on first open)", () => {
    // The script tag for wayfinder.js must be created at runtime,
    // not statically rendered, so the page doesn't pay the cost
    // until somebody clicks Find route.
    expect(snippet).toMatch(/createElement\(["']script["']\)/);
    expect(snippet).toMatch(/wayfinder\.js/);
  });

  it("declares window.SCC_WAYFINDER_CONFIG (the only allowed global)", () => {
    expect(snippet).toMatch(/window\.SCC_WAYFINDER_CONFIG/);
  });

  it("inherits Squarespace site-style HSL vars with fallbacks", () => {
    expect(snippet).toMatch(/var\(--accent-hsl/);
    expect(snippet).toMatch(/var\(--white-hsl/);
  });

  it("ships with a working default HOST (jsDelivr) or an obvious placeholder", () => {
    // Operator either gets a working default they can pin to a
    // release tag, or a `YOUR-HOST` string to find-and-replace.
    expect(snippet).toMatch(/wayfinder\.southcommoncentre\.ca|YOUR-HOST|cdn\.jsdelivr\.net/);
  });

  it("shows a loading message inside the modal before the bundle mounts", () => {
    // Without this an opener sees the modal pop with an empty white
    // box and assumes the wayfinder is broken. The bundle replaces
    // the #scc-wayfinder contents on mount, so the loading message
    // is auto-cleared.
    expect(snippet).toMatch(/<div\s+id=["']scc-wayfinder["'][^>]*>[\s\S]+?Loading[\s\S]*?<\/div>/i);
  });

  it("handles the bundle script failing to load (404 / CORS / typo)", () => {
    // We must attach an onerror to the injected <script> so the
    // operator gets a visible failure mode instead of a silent
    // blank modal.
    expect(snippet).toMatch(/onerror\s*=|addEventListener\(['"]error['"]/);
  });

  it("defaults HOST to jsDelivr off the published repo", () => {
    // Squarespace's own /s/ uploader rejects ES-module MIME types
    // and lacks CORS headers (verified 2026-05-26). jsDelivr serves
    // GitHub repo contents with proper CORS + correct MIME, so the
    // default HOST should point there. Operator can still swap it
    // for their own CDN if they prefer.
    expect(snippet).toMatch(/cdn\.jsdelivr\.net\/gh\/[\w-]+\/[\w-]+/);
  });

  it("cache-busts the bundle URLs (so browser cache doesn't pin old versions)", () => {
    // jsDelivr serves the latest @main commit, but browsers cache
    // <script type="module"> aggressively — Ctrl+Shift+R on the
    // embedding page doesn't always purge a dynamically-injected
    // module script. Each bundle URL needs a cache-bust query
    // string the operator bumps on deploy.
    // We accept either ?v=<token> or ?<digits>+ — the test only
    // pins the contract, not the version syntax.
    expect(
      snippet,
      "snippet must append a cache-bust query string to wayfinder.js + wayfinder.css URLs",
    ).toMatch(/wayfinder\.js['"]?\s*\+\s*['"]?\?v=|wayfinder\.js\?v=|\+\s*['"]?\?v=/);
  });
});
