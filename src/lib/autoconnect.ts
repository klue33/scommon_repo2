/**
 * autoconnect — merge a multi-component graph into a single
 * connected component by adding the minimum number of bridging
 * edges between geometrically-nearest node pairs.
 *
 * Input:  { nodes: GraphNode[], edges: GraphEdge[] }
 * Output: same shape; original nodes and edges preserved; added
 *         edges marked `auto: true` so the operator can audit
 *         them in the in-app editor.
 *
 * Strategy:
 *   1. Find all connected components.
 *   2. Pick the largest as the "spine."
 *   3. For each non-spine component, find the closest (Euclidean)
 *      node-pair between this component and the spine, and add a
 *      single edge between them. Cost = round(distance).
 *   4. After bridging a component, fold it into the spine so the
 *      next component compares against the growing spine (not the
 *      original).
 *
 * Contract: tests/autoconnect.test.ts.
 */

interface AutoNode {
  id: string;
  x: number;
  y: number;
  type: string;
  store?: string;
  label?: string;
}
interface AutoEdge {
  a: string;
  b: string;
  cost: number;
  auto?: boolean;
}
export interface AutoGraph {
  nodes: AutoNode[];
  edges: AutoEdge[];
}

function adjacency(g: AutoGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  return adj;
}

function findComponents(g: AutoGraph): string[][] {
  const adj = adjacency(g);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of g.nodes) {
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
  // Sort descending by size so [0] is the spine.
  out.sort((a, b) => b.length - a.length);
  return out;
}

function dist(a: AutoNode, b: AutoNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * For the given source set of node IDs (the component being
 * bridged in), find the closest (source, target) pair against
 * `targetIds`. Returns null if either set is empty.
 */
function nearestPair(
  byId: Map<string, AutoNode>,
  sourceIds: string[],
  targetIds: string[],
): { source: string; target: string; distance: number } | null {
  if (sourceIds.length === 0 || targetIds.length === 0) return null;
  let best = { source: "", target: "", distance: Infinity };
  for (const s of sourceIds) {
    const sn = byId.get(s)!;
    for (const t of targetIds) {
      const tn = byId.get(t)!;
      const d = dist(sn, tn);
      if (d < best.distance) best = { source: s, target: t, distance: d };
    }
  }
  return best.distance === Infinity ? null : best;
}

export function autoconnect(graph: AutoGraph): AutoGraph {
  // Already connected (or empty / single node)? Return as-is.
  const comps = findComponents(graph);
  if (comps.length <= 1) return { nodes: [...graph.nodes], edges: [...graph.edges] };

  const byId = new Map<string, AutoNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  // Start with the largest component as the spine and grow it.
  const spine = new Set(comps[0]);
  const newEdges: AutoEdge[] = [];

  for (let i = 1; i < comps.length; i++) {
    const comp = comps[i];
    const best = nearestPair(byId, comp, Array.from(spine));
    if (!best) continue; // shouldn't happen
    if (best.source === best.target) continue;
    newEdges.push({
      a: best.source,
      b: best.target,
      cost: Math.max(1, Math.round(best.distance)),
      auto: true,
    });
    // Fold this component into the spine.
    for (const id of comp) spine.add(id);
  }

  return {
    nodes: [...graph.nodes],
    edges: [...graph.edges, ...newEdges],
  };
}
