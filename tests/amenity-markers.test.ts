import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STORES } from "@/src/lib/stores";

/**
 * Amenities (washrooms, security, info desks, future kiosk-like
 * points) live in stores.json with a centroid but no companion
 * polygon in site.geojson — they're points, not retail units.
 * Without a dedicated renderer the search lists them but the map
 * stays blank when the user selects one. That's what the user
 * reported as "missing" after the bundle started serving.
 *
 * Contract:
 *   1. STORES contains at least one amenity (washroom + security
 *      shipped in the same release as this test).
 *   2. MapViewer.tsx contains a renderer for amenity markers,
 *      identified by the .scc-wf__amenity class. The renderer must
 *      run unconditionally — not gated on editMode — so visitors
 *      see the marker.
 */
describe("amenity markers", () => {
  it("catalogue ships at least one amenity store", () => {
    const amenities = STORES.filter((s) => s.category === "amenities");
    expect(amenities.length, "no amenities in stores.json").toBeGreaterThan(0);
    for (const a of amenities) {
      expect(a.centroid, `amenity ${a.id} needs a centroid to render on the map`).toBeTruthy();
    }
  });

  it("MapViewer renders amenity markers", () => {
    const src = readFileSync(
      resolve(__dirname, "../src/components/MapViewer.tsx"),
      "utf8",
    );
    expect(
      src,
      "MapViewer.tsx must include an amenity marker renderer (look for class 'scc-wf__amenity').",
    ).toMatch(/scc-wf__amenity/);
  });

  it("Path editor exposes Washroom and Security tool buttons", () => {
    // Operator drops amenity points on-site by clicking the floor
    // map in edit mode. Without dedicated tools they'd have to type
    // node ids by hand. The tool ids match new node types so the
    // existing addNodeAt path-through works unchanged.
    const src = readFileSync(
      resolve(__dirname, "../src/components/MapViewer.tsx"),
      "utf8",
    );
    expect(src).toMatch(/id:\s*["']amenity-washroom["']/);
    expect(src).toMatch(/id:\s*["']amenity-security["']/);
    // The EditNodeType union must include both, otherwise addNodeAt
    // wouldn't accept them.
    expect(src).toMatch(/EditNodeType\s*=\s*[^;]*amenity-washroom/);
    expect(src).toMatch(/EditNodeType\s*=\s*[^;]*amenity-security/);
  });
});
