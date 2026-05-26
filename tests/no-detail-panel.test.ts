import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The selected-store detail panel (rendered as
 * `<div class="scc-wf__detail">`, showing tenant name + unit +
 * category) was removed at the operator's request — clicking a
 * store on the map highlights it without surfacing a popout.
 *
 * Contract: wayfinder.tsx no longer renders that block at all.
 */
describe("selected-store detail panel removed", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/wayfinder.tsx"),
    "utf8",
  );

  it("does not render a .scc-wf__detail element", () => {
    expect(src).not.toMatch(/class=["']scc-wf__detail["']/);
  });

  it("does not render the unit/category meta line", () => {
    // The phrase "Unit {to.unit}" was the giveaway text in the panel.
    expect(src).not.toMatch(/Unit \{to\.unit\}/);
  });
});
