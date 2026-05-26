# scc-wayfinder — project rules

Site directory + wayfinder for South Common Centre (Mississauga),
**embedded into the existing Squarespace site** at
`southcommoncentre.ca/wayfinder`.

SCC is a **single-level outdoor power centre**. The existing site's
"Map Level 1 / 2 / 3" UI is an alias for category groupings, not
physical floors. This project models the site as one plane with
category filters — never reintroduce a `floor` field on stores or
graph nodes.

## Stack

- Vite + Preact + TypeScript → single ES-module bundle
- Vitest for unit tests
- npm (pnpm 11's build-script gating wasn't worth fighting; npm works
  fine with this dep set)

Output is `dist/wayfinder.js` + `dist/wayfinder.css`, embedded via a
Squarespace Code Block (see `EMBED.md`). No Next.js, no SSR, no
iframe.

## Squarespace integration — non-negotiables

1. **Inherit the SCC palette** via Squarespace's site-style CSS vars:
   `--accent-hsl`, `--black-hsl`, `--white-hsl`,
   `--lightAccent-hsl`, `--darkAccent-hsl`. Never hard-code SCC's
   orange / cream / charcoal hex into the live bundle — fallback
   values are for standalone dev only. If the operator changes the
   site palette in Site Styles, the wayfinder must follow.
2. **Scope every selector under `.scc-wf`**. The bundle is injected
   into the same DOM as the rest of Squarespace; an un-scoped
   `button { ... }` rule would leak.
3. **No iframe**. Iframes break deep-link URL params, mobile sizing,
   and CSS-var inheritance.
4. **No global pollution.** The only globals the embed touches are
   `window.SCC_WAYFINDER_CONFIG` (input) and the `#scc-wayfinder`
   mount node.

## Conventions

- All map data is **static JSON** in `data/` — no DB. Tenants change
  a few times a year; ship updates via PR + rebuild + re-upload.
- The site plan is one SVG, `public/maps/site.svg`. Store shapes
  carry `data-store-id="<slug>"` matching `stores.json`.
- The node graph is one file, `data/graph.json`: `{nodes, edges}`.
  `type` is `kiosk|store|junction|exit`. No vertical-transport
  nodes — single level.
- Routing lives in `src/lib/pathfind.ts`. Straight A* with Euclidean
  heuristic; returns `{path, cost, points}` for direct polyline
  render.

## Dev

- Bind to **loopback only** (`127.0.0.1`). Default port: **3100**.
- `npm run dev` serves with the SCC palette stand-in from `index.html`.
- `npm run build` outputs to `dist/`. Don't rename the output files
  — the Squarespace Code Block references them by name.

## Tests

- Pathfinding with fixture graphs (`tests/pathfind.test.ts`): basic
  route, picks lowest-cost alternative, cross-site route, no-path.
- Store search ranking (`tests/stores.test.ts`).
- Hours / open-now with frozen clock (`tests/hours.test.ts`).
- `npm test` green before merge.

## Memory

Auto-memory at `~/.claude/projects/-home-klodin/memory/`. Update on
non-obvious decisions (e.g. why we inherit Squarespace tokens vs
hard-coding, why Code Block vs iframe).
