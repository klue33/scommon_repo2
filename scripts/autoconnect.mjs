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
const SITE_GEOJSON = path.join(ROOT, "public", "maps", "site.geojson");

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

// ── polygon geometry (mirrors src/lib/autoconnect.ts) ─────────────
function orient(a, b, c) {
  return Math.sign((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]));
}
function segmentsCross(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}
function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > p[1]) !== (yj > p[1])) &&
      (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function segmentEntersPolygon(a, b, ring) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (segmentsCross(a, b, ring[i], ring[j])) return true;
  }
  const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2];
  return pointInRing(mid, ring);
}
function bridgeBlockage(a, b, polygons, barriers) {
  if (
    (a.type === "store" && b.type !== "entrance-tenant" && b.type !== "entrance-main" && b.type !== "kiosk") ||
    (b.type === "store" && a.type !== "entrance-tenant" && a.type !== "entrance-main" && a.type !== "kiosk")
  ) return "wall";
  const ap = [a.x, a.y], bp = [b.x, b.y];
  for (const poly of polygons) {
    const aOwns = (a.type === "store" && a.store === poly.store_id) || pointInRing(ap, poly.ring);
    const bOwns = (b.type === "store" && b.store === poly.store_id) || pointInRing(bp, poly.ring);
    if (aOwns || bOwns) continue;
    if (segmentEntersPolygon(ap, bp, poly.ring)) return "polygon";
  }
  for (const bar of barriers) {
    if (segmentsCross(ap, bp, bar.a, bar.b)) return "barrier";
  }
  return "clean";
}

function autoconnect(graph, polygons, barriers) {
  const comps = components(graph);
  const passthrough = graph.barriers ? { barriers: graph.barriers } : {};
  if (comps.length <= 1) return { nodes: [...graph.nodes], edges: [...graph.edges], ...passthrough };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const spine = new Set(comps[0]);
  const newEdges = [];
  for (let i = 1; i < comps.length; i++) {
    const comp = comps[i];
    // Build candidates sorted by distance; pick the first whose
    // bridge doesn't cross a foreign polygon or a barrier. Fall
    // back to the absolute nearest with a flag if no clean bridge
    // exists.
    const cands = [];
    for (const s of comp) {
      const sn = byId.get(s);
      for (const t of spine) {
        const tn = byId.get(t);
        if (bridgeBlockage(sn, tn, polygons, barriers) === "wall") continue;
        cands.push({ source: s, target: t, distance: dist(sn, tn) });
      }
    }
    cands.sort((a, b) => a.distance - b.distance);
    let chosen = null;
    for (const c of cands) {
      const r = bridgeBlockage(byId.get(c.source), byId.get(c.target), polygons, barriers);
      if (r === "clean") {
        chosen = { ...c, crossesPolygon: false, crossesBarrier: false }; break;
      }
    }
    if (!chosen && cands.length) {
      const fb = cands[0];
      const r = bridgeBlockage(byId.get(fb.source), byId.get(fb.target), polygons, barriers);
      chosen = { ...fb, crossesPolygon: r === "polygon", crossesBarrier: r === "barrier" };
    }
    if (!chosen || chosen.source === chosen.target) continue;
    const e = {
      a: chosen.source, b: chosen.target,
      cost: Math.max(1, Math.round(chosen.distance)),
      auto: true,
    };
    if (chosen.crossesPolygon) e.crossesPolygon = true;
    if (chosen.crossesBarrier) e.crossesBarrier = true;
    newEdges.push(e);
    for (const id of comp) spine.add(id);
  }
  return { nodes: [...graph.nodes], edges: [...graph.edges, ...newEdges], ...passthrough };
}

function loadPolygons() {
  if (!fs.existsSync(SITE_GEOJSON)) return [];
  const geo = JSON.parse(fs.readFileSync(SITE_GEOJSON, "utf8"));
  const out = [];
  for (const f of geo.features ?? []) {
    if (f.geometry?.type !== "Polygon") continue;
    const rings = f.geometry.coordinates ?? [];
    if (!rings[0]) continue;
    out.push({ store_id: f.properties?.store_id ?? "?", ring: rings[0] });
  }
  return out;
}

// ---- main ----------------------------------------------------------

const before = JSON.parse(fs.readFileSync(GRAPH, "utf8"));
const beforeComps = components(before);
const polygons = loadPolygons();
const barriers = Array.isArray(before.barriers) ? before.barriers : [];
console.log(`Before:`);
console.log(`  nodes:       ${before.nodes.length}`);
console.log(`  edges:       ${before.edges.length}`);
console.log(`  components:  ${beforeComps.length}`);
console.log(`  spine size:  ${beforeComps[0]?.length ?? 0}`);
console.log(`  polygons:    ${polygons.length}  (from public/maps/site.geojson)`);
console.log(`  barriers:    ${barriers.length}  (from data/graph.json)`);

const after = autoconnect(before, polygons, barriers);
const afterComps = components(after);
const added = after.edges.length - before.edges.length;

console.log(`\nAfter autoconnect:`);
console.log(`  nodes:       ${after.nodes.length}`);
console.log(`  edges:       ${after.edges.length}  (+${added})`);
console.log(`  components:  ${afterComps.length}`);
console.log(`  spine size:  ${afterComps[0]?.length ?? 0}`);

if (added > 0) {
  const crossing = after.edges.slice(before.edges.length).filter((e) => e.crossesPolygon);
  console.log(`\nNew bridging edges (cost = Euclidean distance):`);
  for (const e of after.edges.slice(before.edges.length)) {
    const a = before.nodes.find((n) => n.id === e.a);
    const b = before.nodes.find((n) => n.id === e.b);
    const flag = e.crossesPolygon ? "  ⚠ crosses polygon" : "";
    console.log(
      `  ${e.a}  ↔  ${e.b}   cost=${e.cost}` +
      `   (${a?.type ?? "?"} ↔ ${b?.type ?? "?"})${flag}`,
    );
  }
  if (crossing.length) {
    console.log(
      `\n${crossing.length} bridge${crossing.length === 1 ? "" : "s"} could not avoid a polygon; ` +
      `flagged with crossesPolygon: true. Review in the editor and re-route by hand if needed.`,
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
