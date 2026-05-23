# scc-wayfinder — project rules

Indoor mall wayfinder for South Common Centre. SVG-vector map,
hand-authored node graph, A* routing, store directory.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind for styling
- pnpm
- Vitest for unit tests

## Conventions

- All map data is **static JSON** in `data/` — no DB. The mall changes
  tenants a few times a year; ship updates via PR + redeploy.
- Floor plans are SVG in `public/maps/level-<n>.svg`. Each store
  shape carries `data-store-id="<slug>"` so the React layer can bind
  click/hover without an extra mapping table.
- The node graph (`data/graph.l<n>.json`) is `{nodes: [{id,x,y,type}],
  edges: [{a,b,cost,mode}]}`. `type` is `kiosk|store|junction|stair|
  escalator|elevator|exit`. `mode` is `walk|stair|escalator|elevator`
  and the accessibility routing toggle filters edges by mode.
- Routing lives in `lib/pathfind.ts`. Cross-floor edges connect a
  vertical-transport node on one floor to its twin on the next; the
  router returns a list of (floor, polyline) segments so the UI can
  show floor-change callouts.

## Dev

- Bind to **loopback only** (`127.0.0.1`). The kiosk build is a
  separate Electron wrapper later; the web app must not be exposed
  to LAN by default.
- Default port: **3100**.

## Tests

- Test pathfinding with small fixture graphs in
  `tests/pathfind.test.ts`. Cover: same-floor route, cross-floor via
  elevator, accessibility mode skipping stairs, no-path case.
- Test store search ranking in `tests/stores.test.ts`.
- Test hours/open-now in `tests/hours.test.ts` with frozen clock.
- Run with `pnpm test`. Green before merge.

## Memory

Auto-memory at `~/.claude/projects/-home-klodin/memory/`. Update on
non-obvious decisions (e.g. why a particular graph encoding, why
SVG over Canvas).
