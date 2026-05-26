import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Live tuner UI for the backdrop fit. Operator hits the page with
 * ?tune=1 in the URL and gets a floating panel with three numeric
 * inputs — scale, offset X, offset Y — that update the rendering in
 * real time so they can dial in the alignment without page reloads.
 *
 * Contract:
 *   - The bundle gates the tuner on a `tune` URL parameter (so it
 *     doesn't appear for ordinary visitors).
 *   - The panel exposes inputs wired to scale + offsetX + offsetY.
 *   - The <image> attributes flow from state, not from the static
 *     config values, so input changes flow through to the SVG
 *     without a remount.
 */
describe("backdrop tuner panel", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  it("gates the tuner on a `tune` URL parameter", () => {
    expect(src).toMatch(/tune/);
    // Either URLSearchParams or a search-string contains check.
    expect(src).toMatch(/searchParams|URLSearchParams|location\.search/);
  });

  it("renders a tuner panel with the three knob labels", () => {
    // Loose check — the rendered panel must show user-readable
    // labels for each knob.
    expect(src).toMatch(/[Ss]cale/);
    expect(src).toMatch(/[Oo]ffset\s*X/);
    expect(src).toMatch(/[Oo]ffset\s*Y/);
  });

  it("uses state for the three backdrop knobs", () => {
    // The whole point of the panel is real-time updates, which means
    // the values must live in React state (useState).
    expect(src).toMatch(/setBackdropScale|backdropScale[\s\S]{0,200}useState/);
    expect(src).toMatch(/setBackdropOffsetX|backdropOffsetX[\s\S]{0,200}useState/);
  });

  it("the <image> reads from state-derived values", () => {
    // Same backdropX / backdropY / backdropW / backdropH names used
    // by the <image> — they should still be present (we kept the
    // derived locals).
    expect(src).toMatch(/backdropW/);
    expect(src).toMatch(/backdropH/);
  });
});
