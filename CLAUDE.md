# scc-wayfinder — project rules

Indoor mall wayfinder for South Common Centre, **embedded into the
existing Squarespace site** at `southcommoncentre.ca/wayfinder`.

## Stack

- Vite + Preact + TypeScript → single ES-module bundle
- Vitest for unit tests
- pnpm

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

- All map data is **static JSON** in `data/` — no DB. Mall tenants
  change a few times a year; ship updates via PR + rebuild +
  re-upload.
- Floor plans are SVG in `public/maps/level-<n>.svg`. Store shapes
  carry `data-store-id="<slug>"` matching `stores.json`.
- The node graph (`data/graph.l<n>.json`) is `{nodes, edges,
  vertical?}`. `type` is `kiosk|store|junction|stair|escalator|
  elevator|exit`. `mode` is `walk|stair|escalator|elevator`;
  accessibility routing filters edges by mode.
- Routing lives in `src/lib/pathfind.ts`. Cross-floor edges connect a
  vertical-transport node on one floor to its twin on the next; the
  router returns a list of (floor, polyline) segments so the UI can
  show floor-change callouts.

## Dev

- Bind to **loopback only** (`127.0.0.1`). Default port: **3100**.
- `pnpm dev` serves with the SCC palette stand-in from `index.html`.
- `pnpm build` outputs to `dist/`. Don't rename the output files —
  the Squarespace Code Block references them by name.

## Tests

- Pathfinding with fixture graphs (`tests/pathfind.test.ts`):
  same-floor, cross-floor via elevator, accessibility mode skipping
  stairs/escalators, no-path.
- Store search ranking (`tests/stores.test.ts`).
- Hours / open-now with frozen clock (`tests/hours.test.ts`).
- `pnpm test` green before merge.

## Memory

Auto-memory at `~/.claude/projects/-home-klodin/memory/`. Update on
non-obvious decisions (e.g. why we inherit Squarespace tokens vs
hard-coding, why Code Block vs iframe).
