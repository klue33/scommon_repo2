#!/usr/bin/env node
/**
 * scripts/autoconnect.mjs
 *
 * Apply autoconnect to data/graph.json. Adds the minimum number
 * of bridging edges (each marked auto:true) so the graph becomes
 * a single connected component. User-drawn edges are preserved
 * unchanged.
 *
 * Usage:
 *   node scripts/autoconnect.mjs            # apply + save
 *   node scripts/autoconnect.mjs --dry-run  # report only, don't write
 *
 * Always writes a backup to data/graph.json.bak-<timestamp>
 * before mutating.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const GRAPH = path.join(ROOT, "data", "graph.json");

const dryRun = process.argv.includes("--dry-run");

// Re-implement autoconnect inline so this script has no compile
// step. The TypeScript version in src/lib/autoconnect.ts is the
// source of truth (with tests); this is a kept-in-sync copy.

function adjacency(g) {
  const adj = new Map();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) {
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  return adj;
}
function components(g) {
  const adj = adjacency(g);
  const seen = new Set();
  const out = [];
  for (const n of g.nodes) {
    if (seen.has(n.id)) continue;
    const comp = [];
    const stack = [n.id];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const nx of adj.get(cur) ?? []) stack.push(nx);
    }
    out.push(comp);
  }
  out.sort((a, b) => b.length - a.length);
  return out;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function autoconnect(graph) {
  const comps = components(graph);
  if (comps.length <= 1) return { nodes: [...graph.nodes], edges: [...graph.edges] };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const spine = new Set(comps[0]);
  const newEdges = [];
  for (let i = 1; i < comps.length; i++) {
    const comp = comps[i];
    let best = null;
    for (const s of comp) {
      const sn = byId.get(s);
      for (const t of spine) {
        const tn = byId.get(t);
        const d = dist(sn, tn);
        if (best === null || d < best.distance) best = { source: s, target: t, distance: d };
      }
    }
    if (!best || best.source === best.target) continue;
    newEdges.push({
      a: best.source, b: best.target,
      cost: Math.max(1, Math.round(best.distance)),
      auto: true,
    });
    for (const id of comp) spine.add(id);
  }
  return { nodes: [...graph.nodes], edges: [...graph.edges, ...newEdges] };
}

// ---- main ----------------------------------------------------------

const before = JSON.parse(fs.readFileSync(GRAPH, "utf8"));
const beforeComps = components(before);
console.log(`Before:`);
console.log(`  nodes:       ${before.nodes.length}`);
console.log(`  edges:       ${before.edges.length}`);
console.log(`  components:  ${beforeComps.length}`);
console.log(`  spine size:  ${beforeComps[0]?.length ?? 0}`);

const after = autoconnect(before);
const afterComps = components(after);
const added = after.edges.length - before.edges.length;

console.log(`\nAfter autoconnect:`);
console.log(`  nodes:       ${after.nodes.length}`);
console.log(`  edges:       ${after.edges.length}  (+${added})`);
console.log(`  components:  ${afterComps.length}`);
console.log(`  spine size:  ${afterComps[0]?.length ?? 0}`);

if (added > 0) {
  console.log(`\nNew bridging edges (cost = Euclidean distance):`);
  for (const e of after.edges.slice(before.edges.length)) {
    const a = before.nodes.find((n) => n.id === e.a);
    const b = before.nodes.find((n) => n.id === e.b);
    console.log(
      `  ${e.a}  ↔  ${e.b}   cost=${e.cost}` +
      `   (${a?.type ?? "?"} ↔ ${b?.type ?? "?"})`,
    );
  }
}

if (dryRun) {
  console.log(`\n[dry-run] No files written.`);
  process.exit(0);
}

if (added === 0) {
  console.log(`\nNothing to do — graph already a single component.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${GRAPH}.bak-${stamp}`;
fs.copyFileSync(GRAPH, backup);
fs.writeFileSync(GRAPH, JSON.stringify(after, null, 2) + "\n");
console.log(`\nBackup:  ${path.relative(ROOT, backup)}`);
console.log(`Wrote:   ${path.relative(ROOT, GRAPH)}`);
