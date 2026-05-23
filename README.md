# scc-wayfinder

Rebuild of the South Common Centre (Edmonton) mall wayfinder
(`southcommoncentre.ca/wayfinder`). The existing site serves a static
SVG floor plan with a basic store search across three levels. This
rebuild keeps the SVG-vector approach but layers on the interactive
features mall visitors actually expect in 2026.

## Stack

- Next.js 14 (App Router) + TypeScript
- React + Tailwind
- SVG vector floor plans (authored in Figma/Inkscape, served from
  `public/maps/`)
- Pathfinding via a hand-authored node graph overlay (A*)
- No external wayfinder vendor (Mappedin / Jibestream / Concept3D)
- Data: stores live in `data/stores.json`; nodes/edges per floor in
  `data/graph.<floor>.json`

## Feature plan

### Parity with current site
- [x] Three-level SVG floor plans (L1 / L2 / L3)
- [x] Store directory list
- [x] Store name search
- [x] Click a store on the map → highlight + detail

### New features (the "more" part)
- [ ] **Pan + pinch-zoom** on the map (touch + mouse)
- [ ] **Category filters** (Food, Apparel, Services, Anchors,
      Restrooms, ATMs)
- [ ] **"You are here"** — pick a starting kiosk or scan a kiosk QR
      to set origin
- [ ] **Turn-by-turn routing** — A\* over the node graph, renders the
      route polyline, handles inter-floor transitions via escalators /
      elevators / stairs with floor-change callouts
- [ ] **Accessibility routing** — toggle to prefer elevators over
      stairs / escalators
- [ ] **Open-now indicator** per store using mall hours + per-store
      overrides
- [ ] **Deep links** — `/wayfinder?to=store-slug&from=kiosk-3` so a
      QR code or push notification can drop a visitor onto a live
      route
- [ ] **Mobile-first layout** — bottom sheet for directory, map
      fills viewport
- [ ] **Offline-capable** — service worker caches SVGs + store data
      so the kiosk keeps working if the mall WiFi blips
- [ ] **Admin import** — CSV upload (store name, unit#, category,
      hours, logo) regenerates `stores.json`
- [ ] **Analytics** — anonymous counts of "directions to X" so the
      mall can see which stores draw the most queries

### Stretch
- [ ] Parking-lot map with section letters and "where did I park"
      save pin
- [ ] Multilingual (EN / FR)
- [ ] Dark mode for evening kiosk use

## Layout

```
app/                 Next.js routes (wayfinder UI)
components/          MapViewer, FloorSelector, StoreDirectory, RoutePanel
lib/                 pathfind.ts (A*), stores.ts, hours.ts
data/                stores.json, graph.l1.json, graph.l2.json, graph.l3.json
public/maps/         level-1.svg, level-2.svg, level-3.svg
tests/               unit tests (pathfinding, store search, hours)
```

## Local dev

```
pnpm install
pnpm dev          # http://127.0.0.1:3100
pnpm test
```

Bound to loopback only by default. Port 3100 to stay clear of other
local services.

## Status

Scaffold only — SVGs are placeholders, store data is a tiny sample,
pathfinder is a stub. Next step: trace the real SCC floor plans into
SVG and author the node graph.
