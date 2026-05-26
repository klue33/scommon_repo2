import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every <text> rendered inside the rotated <g> is rotated 137.654°
 * with its parent — i.e. printed nearly upside down. The fix is a
 * counter-rotation transform on each <text> element, around that
 * label's own anchor point, so glyphs face the viewer regardless
 * of map orientation:
 *
 *     transform={`rotate(${-ROTATION_DEG} ${x} ${y})`}
 *
 * Contract:
 *   - The MapViewer source defines a counter-rotation derived from
 *     the same ROTATION_DEG constant (negated). Hard-coding the
 *     literal -137.654 in two places risks drift.
 *   - Every <text> render call inside the rotated group carries
 *     that counter-rotation transform.
 */
describe("MapViewer label counter-rotation", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/components/MapViewer.tsx"),
    "utf8",
  );

  it("defines a counter-rotation derived from ROTATION_DEG", () => {
    // Either `-ROTATION_DEG` or `LABEL_COUNTER_ROTATION = -ROTATION_DEG`.
    expect(src).toMatch(/-\s*ROTATION_DEG/);
  });

  it("applies a rotate(...) transform to every <text> inside the rotated group", () => {
    // Identify every <text element in the JSX; each one must have a
    // sibling transform=... attribute carrying a rotate(...) call.
    // Match only real JSX <text ...> with at least one attribute —
    // the literal `<text>` appears in a comment in MapViewer.tsx and
    // isn't a render call.
    const textMatches = Array.from(src.matchAll(/<text\s+([^>]*)>/g));
    expect(textMatches.length, "expected at least one <text> in MapViewer").toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const m of textMatches) {
      const attrs = m[1];
      if (!/transform\s*=/.test(attrs) || !/rotate\(/.test(attrs)) {
        offenders.push(m[0].slice(0, 80));
      }
    }
    expect(offenders, `<text> elements missing rotate(...): ${JSON.stringify(offenders)}`).toEqual([]);
  });
});
