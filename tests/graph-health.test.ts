/**
 * Graph-health diagnostics.
 *
 * The site graph is hand-traced in the live editor at
 * `http://127.0.0.1:3100/?edit=1`. While it's being authored,
 * the kiosk-to-store integration tests in `pathfind.test.ts`
 * are skipped because the graph isn't yet a single connected
 * component.
 *
 * These tests don't *enforce* a single component (the graph is
 * a work in progress) — they *report* the current connectivity
 * state on every test run, and they DO enforce a small set of
 * invariants that must hold regardless of how WIP the graph is:
 *
 *   1. The graph object loads and has a `nodes` and `edges`
 *      array.
 *   2. Every edge references node IDs that exist in `nodes`.
 *   3. Every `store`-typed node has a `store` field whose
 *      value matches a node id (the node id IS the store id by
 *      our convention — see CLAUDE.md).
 *   4. There's at least one kiosk node.
 *
 * Once the connectivity report shows a single component, un-skip
 * the integration tests in `pathfind.test.ts`.
 */
import { describe, it, expect } from "vitest";
import graph from "@/data/graph.json";

type Node = { id: string; x: number; y: number; type: string; store?: string };
type Edge = { a: string; b: string; cost: number };

const nodes = graph.nodes as Node[];
const edges = graph.edges as Edge[];

function components(): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const comp: string[] = [];
    const stack = [n.id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const nx of adj.get(cur) ?? []) stack.push(nx);
    }
    out.push(comp);
  }
  return out;
}

describe("graph-health", () => {
  it("loads with a nodes + edges array", () => {
    expect(Array.isArray(nodes)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("has at least one kiosk", () => {
    const kiosks = nodes.filter((n) => n.type === "kiosk");
    expect(kiosks.length).toBeGreaterThanOrEqual(1);
  });

  it("every edge references a node that exists", () => {
    const ids = new Set(nodes.map((n) => n.id));
    const orphans = edges.filter((e) => !ids.has(e.a) || !ids.has(e.b));
    expect(orphans, JSON.stringify(orphans.slice(0, 5))).toEqual([]);
  });

  it("every store-typed node has a `store` field equal to its id", () => {
    const offenders = nodes
      .filter((n) => n.type === "store")
      .filter((n) => !n.store || n.store !== n.id);
    expect(offenders, JSON.stringify(offenders.slice(0, 5))).toEqual([]);
  });

  it("reports current connectivity state (does not enforce, just logs)", () => {
    const comps = components();
    const biggest = Math.max(...comps.map((c) => c.length));
    const orphans = nodes.filter((n) => {
      const adj = edges.some((e) => e.a === n.id || e.b === n.id);
      return !adj;
    });
    const kiosks = nodes.filter((n) => n.type === "kiosk");
    const kioskReach = kiosks.map((k) => ({
      id: k.id,
      label: (k as any).label ?? "(unlabeled)",
      reachable:
        (comps.find((c) => c.includes(k.id))?.length ?? 0),
    }));

    // eslint-disable-next-line no-console
    console.log(
      "[graph-health]",
      JSON.stringify(
        {
          nodes: nodes.length,
          edges: edges.length,
          components: comps.length,
          biggestComponent: biggest,
          orphanNodes: orphans.length,
          kiosks: kioskReach,
          ready: comps.length === 1 ? "yes — un-skip the integration tests" : "no — keep wiring in the editor",
        },
        null,
        2,
      ),
    );

    // This expectation is informational: as long as the graph
    // has *something*, this test passes. The number-of-components
    // metric is logged above so the user sees progress.
    expect(nodes.length).toBeGreaterThan(0);
  });
});
