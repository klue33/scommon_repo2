import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The mall layout in stores.json/site.geojson is stored in its raw
 * surveyed orientation, where the BMO -> Shoppers Drug Mart -> Rogers
 * arc slopes down-right at roughly 42° below horizontal. To make the
 * mall visually present at the bottom of the screen (the user's
 * mental model from the original southcommoncentre.ca wayfinder), we
 * counter-rotate the rendering so that anchor line sits parallel to
 * the viewport's bottom edge.
 *
 * Contract: the ROTATION_DEG constant in MapViewer.tsx must rotate
 * the BMO/Shoppers/Rogers centroids onto an essentially horizontal
 * line (residual slope < 0.05).
 */
describe("MapViewer ROTATION_DEG aligns BMO/Shoppers/Rogers to horizontal", () => {
  const mapViewer = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );
  const stores = JSON.parse(
    readFileSync(resolve(__dirname, "../data/stores.json"), "utf8"),
  );

  function centroidOf(id: string): [number, number] {
    for (const s of stores.stores ?? []) {
      if (s.id === id && s.centroid) return s.centroid;
    }
    throw new Error(`missing store: ${id}`);
  }

  it("renders the three anchors nearly parallel to the bottom of the screen", () => {
    const m = mapViewer.match(/ROTATION_DEG\s*=\s*(-?\d+(?:\.\d+)?)/);
    expect(m, "ROTATION_DEG constant not found").toBeTruthy();
    const deg = parseFloat(m![1]);

    // After the parking-lot backdrop was removed we flip 180° so
    // BMO/Shoppers/Rogers sit along the OPPOSITE edge (the side the
    // pedestrian-friendly anchor face now lives on). 180° rotation
    // is slope-invariant, but pin the constant so an accidental
    // revert is caught.
    expect(deg).toBeCloseTo(137.654, 1);

    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // SVG rotate(deg cx cy) rotates point (x,y) about (cx,cy) by
    // `deg` degrees CW in screen space. We only care about the slope
    // after rotation, so any common origin works — use (0,0).
    function rot([x, y]: [number, number]): [number, number] {
      return [x * cos - y * sin, x * sin + y * cos];
    }

    const pts = (["bmo", "shoppersdrugmart", "rogers"] as const).map((id) =>
      rot(centroidOf(id)),
    );

    // Least-squares slope of the rotated points.
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    let num = 0, den = 0;
    for (const p of pts) { num += (p[0] - mx) * (p[1] - my); den += (p[0] - mx) ** 2; }
    const slope = num / den;
    expect(Math.abs(slope)).toBeLessThan(0.05);
  });
});
