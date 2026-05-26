import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Available-for-lease units are physical floor area — the user can't
// shop there, but the walls are real and the unit shape must read as
// part of the mall. Earlier we faded them to ~4% alpha, which was
// effectively invisible; an empty mall outline confused operators.
// The contract: the .scc-wf__unit.is-vacant rule renders a solid
// fill with enough alpha to read as a unit.
describe("vacant-unit styling", () => {
  const css = readFileSync(
    resolve(__dirname, "../src/styles.css"),
    "utf8",
  );

  function block(selector: string): string {
    const start = css.indexOf(selector);
    if (start < 0) throw new Error(`selector ${selector} not in styles.css`);
    const openBrace = css.indexOf("{", start);
    const closeBrace = css.indexOf("}", openBrace);
    return css.slice(openBrace + 1, closeBrace);
  }

  it("vacant units fill with at least 0.5 alpha", () => {
    const rule = block(".scc-wf__unit.is-vacant");
    // Pull the alpha out of an hsla() fill. var(...) inside breaks a
    // naive `[^)]*?` regex, so match the line and extract the LAST
    // float before the closing paren/semicolon.
    const lineMatch = rule.match(/fill:\s*hsla\(([\s\S]*?)\)\s*;/);
    expect(lineMatch, `no hsla fill in .scc-wf__unit.is-vacant rule: ${rule}`).not.toBeNull();
    const args = lineMatch![1];
    const floats = args.match(/[0-9]+(?:\.[0-9]+)?/g) ?? [];
    expect(floats.length, `hsla args parsed unexpectedly: ${args}`).toBeGreaterThan(0);
    const alpha = Number(floats[floats.length - 1]);
    expect(alpha, `fill alpha ${alpha} too low — vacant unit will be invisible`).toBeGreaterThanOrEqual(0.5);
  });

  it("vacant units are not display:none / visibility:hidden", () => {
    const rule = block(".scc-wf__unit.is-vacant");
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/visibility:\s*hidden/);
  });
});
