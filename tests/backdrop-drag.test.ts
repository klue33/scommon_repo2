import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The full level-1.svg backdrop carries 406 paths — way too many
 * for an affine-only fit. Operator opens the page with ?tune=1 and
 * drags the backdrop around with the pointer until the streets and
 * building outlines line up with our polygons. Pointer drag updates
 * backdropOffsetX/backdropOffsetY in state so the move is live.
 *
 * Contract:
 *   - public/maps/level-1.svg ships (the source asset).
 *   - MapViewer's backdrop <image> wires onPointerDown only when
 *     showTuner is true, so regular visitors can't drag it.
 *   - The pointer-down handler captures the pointer, listens for
 *     pointermove, and updates backdropOffsetX/Y on each move.
 *   - The image's CSS cursor is "move" in tuner mode.
 */
describe("backdrop drag-to-align", () => {
  const svgPath = resolve(__dirname, "../public/maps/level-1.svg");
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  it("ships public/maps/level-1.svg", () => {
    expect(existsSync(svgPath)).toBe(true);
  });

  it("backdrop image gates pointer events on showTuner", () => {
    expect(src).toMatch(/showTuner\s*\?\s*"auto"\s*:\s*"none"/);
    expect(src).toMatch(/showTuner\s*\?\s*"move"\s*:\s*"auto"/);
  });

  it("backdrop image attaches an onPointerDown handler", () => {
    expect(src).toMatch(/onPointerDown=\{showTuner/);
  });

  it("the drag handler updates both offset state setters", () => {
    expect(src).toMatch(/setBackdropOffsetX/);
    expect(src).toMatch(/setBackdropOffsetY/);
    expect(src).toMatch(/setPointerCapture/);
  });
});
