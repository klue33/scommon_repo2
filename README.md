# scc-wayfinder

Rebuild of the South Common Centre (Edmonton) mall wayfinder
(`southcommoncentre.ca/wayfinder`). The existing site serves a static
SVG floor plan with basic store search across three levels. This
rebuild keeps the SVG-vector approach but layers on the interactive
features mall visitors expect, and ships as a single embeddable
bundle that drops straight into the existing Squarespace site.

## Stack

- **Vite + Preact + TypeScript** — outputs a single
  `dist/wayfinder.js` (~30 KB gzipped) + `dist/wayfinder.css`
- **Squarespace embed** via a Code Block on the live `/wayfinder`
  page; no Next.js / SSR (Squarespace can't host that). See
  [`EMBED.md`](EMBED.md).
- **Colour scheme**: inherits SCC's site palette through Squarespace's
  `--accent-hsl`, `--black-hsl`, `--white-hsl`,
  `--lightAccent-hsl`, `--darkAccent-hsl` CSS variables. Hex fallbacks
  match the live site (warm cream bg, near-black ink, vibrant
  orange accent, peach light accent, charcoal dark accent) for
  standalone dev only.
- **No external wayfinder vendor** (Mappedin / Jibestream /
  Concept3D).
- **Data**: stores in `data/stores.json`; node/edge graphs per
  floor in `data/graph.l<n>.json`. Static JSON — no DB.
- **Routing**: hand-authored A* over the graph
  (`src/lib/pathfind.ts`).
- **SVG floor plans**: in `public/maps/` (placeholders for now; real
  traces TBD — see `public/maps/README.md`).

## Feature plan

### Parity with current site
- [x] Three-level SVG floor plans (L1 / L2 / L3)
- [x] Store directory list
- [x] Store name search
- [x] Click a store on the map → highlight + detail

### New features (the "more" part)
- [ ] **Pan + pinch-zoom** on the map (touch + mouse)
- [x] **Category filters** (Food, Apparel, Services, Anchors, etc.)
- [ ] **"You are here"** — pick a starting kiosk or scan a kiosk QR
      to set origin
- [ ] **Turn-by-turn routing** — A\* on the node graph, renders the
      route polyline, handles inter-floor transitions via escalators
      / elevators / stairs with floor-change callouts
- [x] **Accessibility routing** — toggle to prefer elevators over
      stairs / escalators (pathfinder honors the flag; UI toggle TBD)
- [x] **Open-now indicator** per store using mall hours + per-store
      overrides
- [x] **Deep links** — `/wayfinder?to=store-slug&from=kiosk-3&floor=2`
      so a QR code or push notification can drop a visitor onto a
      live route
- [x] **Mobile-first layout** — bottom sheet for directory, map
      fills viewport (CSS done; will refine once map is live)
- [ ] **Offline-capable** — service worker caches SVGs + store data
      so the kiosk keeps working if mall WiFi blips
- [ ] **Admin import** — CSV upload regenerates `stores.json`
- [ ] **Analytics** — anonymous counts of "directions to X" so the
      mall can see which stores draw the most queries

### Stretch
- [ ] Parking-lot map with section letters and "where did I park"
      save pin
- [ ] Multilingual (EN / FR)
- [ ] Dark mode for evening kiosk use

## Layout

```
index.html             dev shell with palette stand-in for vite serve
vite.config.ts         single-file bundle config (wayfinder.{js,css})
src/
  embed.ts             entry point; mounts into #scc-wayfinder
  wayfinder.tsx        Preact root component
  styles.css           scoped to .scc-wf, inherits Squarespace vars
  lib/
    pathfind.ts        A* with accessibility mode + floor segments
    stores.ts          search ranking
    hours.ts           open-now logic
data/                  stores.json, graph.l<n>.json
public/maps/           level-<n>.svg (placeholders)
tests/                 vitest specs for pathfind, search, hours
EMBED.md               Squarespace embed recipe
```

## Local dev

```bash
pnpm install
pnpm dev          # http://127.0.0.1:3100
pnpm test
pnpm build        # produces dist/wayfinder.js + dist/wayfinder.css
```

Bound to loopback only. Port 3100 to stay clear of other local
services. The dev page injects a `<style>` block with the SCC palette
HSL vars so the bundle renders with the right colors before it's
embedded into Squarespace.

## Status

Scaffold + embed plumbing complete. Real SVGs and full node graphs
for L3 still to author. Next moves in priority order:

1. `pnpm install` and confirm `pnpm test` is green.
2. Trace L1 / L2 / L3 floor plans into SVG (`public/maps/level-<n>.svg`).
3. Author the node graph for L3 (`data/graph.l3.json`).
4. Build the `MapViewer` component (SVG injection, pan/zoom, store
   highlight, route polyline render).
5. Wire the routing UI (From / To pickers, accessibility toggle).
6. Host the built bundle and update the live `/wayfinder` Code Block
   per `EMBED.md`.
