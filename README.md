# scc-wayfinder

Rebuild of the South Common Centre (Mississauga) site directory and
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
- [x] **Pan + pinch-zoom** on the map (drag + wheel + pointer events;
      touch via `touch-action: none` and pointer capture)
- [x] **Category filters** (Anchors, Apparel, Restaurants, Food &
      Quick Bites, Services, General Merchandise) — replaces the
      legacy Level 1/2/3 buckets
- [x] **"You are here"** — pulses on the routing origin when
      `?from=<kiosk>` is in the URL, or when the user clicks
      "Get directions" (falls back to first kiosk until a starting
      picker exists)
- [x] **Routed polyline** — A\* path renders as a dashed marching
      polyline. Step-by-step text directions still TODO.
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
  embed.tsx            entry point; mounts into #scc-wayfinder
  wayfinder.tsx        Preact root: directory + map + detail panel
  styles.css           scoped to .scc-wf, inherits Squarespace vars
  components/
    MapViewer.tsx      SVG canvas: pan/zoom, stores, kiosks, route,
                       "you are here" pulse
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
(`dist/wayfinder.js` 21.3 KB / 8.6 KB gz; `dist/wayfinder.css`
5.3 KB / 1.6 KB gz). MapViewer renders the synthetic site map from
`data/graph.json` so the dev server shows a working wayfinder right
now — pan, zoom, store highlight, "you are here" pulse, dashed
animated route polyline all live. Next moves:

1. ~~`npm install && npm test`~~ — done, green.
2. Trace the real SCC site plan into `public/maps/site.svg` with
   `data-store-id="<slug>"` on each store shape.
3. Author the real node graph against the traced SVG coordinates.
4. ~~Build `MapViewer`~~ — done (renders from graph for now). Swap
   to fetching `public/maps/site.svg` once the real plan is traced.
5. Wire a proper "From" picker (kiosk dropdown / map-click); the
   accessible "Choose your starting point" flow.
6. Host the built bundle; update the live `/wayfinder` Code Block
   per `EMBED.md`.
