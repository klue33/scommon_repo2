# scc-wayfinder

Rebuild of the South Common Centre (Edmonton) site directory and
wayfinder (`southcommoncentre.ca/wayfinder`). The existing page is
a static SVG with a basic store search. This rebuild keeps the
SVG-vector approach but layers on the interactive features visitors
expect, and ships as a single embeddable bundle that drops straight
into the existing Squarespace site.

## Site model

South Common Centre is a **single-level** outdoor power centre. The
existing site labels its directory views "Map Level 1 / 2 / 3" but
those are aliases for **category groupings** (food / restaurants /
services / etc.), not physical floors. This rebuild drops the
pseudo-floor abstraction and exposes categories directly via filter
chips, with one shared SVG site plan and one shared node graph.

## Stack

- **Vite + Preact + TypeScript** — outputs a single
  `dist/wayfinder.js` (~30 KB gzipped) + `dist/wayfinder.css`.
- **Squarespace embed** via a Code Block on the live `/wayfinder`
  page; no Next.js / SSR. See [`EMBED.md`](EMBED.md).
- **Colour scheme**: inherits SCC's site palette via Squarespace's
  `--accent-hsl`, `--black-hsl`, `--white-hsl`,
  `--lightAccent-hsl`, `--darkAccent-hsl` CSS variables. Live hex
  fallbacks (warm cream bg, near-black ink, vibrant orange accent,
  peach light accent, charcoal dark accent) only fire in standalone
  dev.
- **No external wayfinder vendor** (Mappedin / Jibestream /
  Concept3D).
- **Data**: stores in `data/stores.json`; nodes/edges in
  `data/graph.json`. Static JSON — no DB.
- **Routing**: hand-authored A* on the single-plane graph
  (`src/lib/pathfind.ts`).
- **SVG site plan**: `public/maps/site.svg` (placeholder until we
  trace the real plan).

## Feature plan

### Parity with current site
- [x] Site directory list
- [x] Store name search
- [x] Click a store on the map → highlight + detail panel

### New features (the "more" part)
- [ ] **Pan + pinch-zoom** on the map (touch + mouse)
- [x] **Category filters** (Anchors, Apparel, Restaurants, Food &
      Quick Bites, Services, General Merchandise) — replaces the
      legacy Level 1/2/3 buckets
- [ ] **"You are here"** — pick a kiosk or scan a kiosk QR
- [ ] **Turn-by-turn routing** — A\* on the graph; renders the
      route polyline; step-by-step text directions for kiosk mode
- [x] **Open-now indicator** per store using mall hours + per-store
      overrides
- [x] **Deep links** — `/wayfinder?to=<slug>&from=<kiosk>&category=<slug>`
      so QR codes / push notifications drop visitors onto a live
      route
- [x] **Mobile-first layout** — directory collapses to bottom sheet
      (CSS done; refine once map is live)
- [ ] **Offline-capable** — service worker caches SVG + store data
      so kiosks keep working if mall WiFi blips
- [ ] **Admin import** — CSV upload regenerates `stores.json`
- [ ] **Analytics** — anonymous counts of "directions to X"

### Stretch
- [ ] Parking-lot map with section letters and "where did I park"
      save pin
- [ ] Multilingual (EN / FR)
- [ ] Dark mode for evening kiosk use

## Layout

```
index.html             dev shell with palette stand-in for vite serve
vite.config.ts         single-file bundle config
src/
  embed.ts             entry point; mounts into #scc-wayfinder
  wayfinder.tsx        Preact root component
  styles.css           scoped to .scc-wf, inherits Squarespace vars
  lib/
    pathfind.ts        A* on a single-plane graph
    stores.ts          search ranking
    hours.ts           open-now logic
data/                  stores.json, graph.json
public/maps/           site.svg (placeholder)
tests/                 vitest specs for pathfind, search, hours
EMBED.md               Squarespace embed recipe
```

## Local dev

```bash
npm install
npm run dev       # http://127.0.0.1:3100
npm test
npm run build     # produces dist/wayfinder.js + dist/wayfinder.css
npm run typecheck
```

Bound to loopback only. Port 3100. The dev page injects a `<style>`
block with the SCC palette HSL vars so the bundle renders with the
right colors before it's embedded into Squarespace.

## Status

Scaffold + embed plumbing complete; floor model removed in favour of
categories. All 13 tests green, bundle builds clean
(`dist/wayfinder.js` 16.6 KB / 6.8 KB gz; `dist/wayfinder.css`
3.2 KB / 1.1 KB gz). Next moves:

1. ~~`npm install && npm test`~~ — done, green.
2. Trace the real SCC site plan into `public/maps/site.svg` with
   `data-store-id="<slug>"` on each store shape.
3. Author the real node graph against the traced SVG coordinates.
4. Build `MapViewer` (SVG injection, pan/zoom, store highlight,
   route polyline).
5. Wire the routing UI (From / To pickers).
6. Host the built bundle; update the live `/wayfinder` Code Block
   per `EMBED.md`.
