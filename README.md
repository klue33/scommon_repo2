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

## Deployment

Two equivalent options. Both produce the same live wayfinder; the
trade-off is **external dependency vs paste size**.

### Option A — fully inlined (recommended; no external deps)

Two flavours, both with the entire JS bundle + CSS inlined and the
same zero-external-deps story:

- `docs/squarespace-inline-bundle.html` — paste this on a dedicated
  `/wayfinder` page. The wayfinder fills the page area.
- `docs/squarespace-popup-bundle.html` — paste this on any page
  (home, category, contact, etc.) and visitors get a "Find route"
  pill button that opens the wayfinder in a modal overlay.

Both snippets carry the same `SCC_WAYFINDER_CONFIG` block with five
asset-URL slots. After uploading the asset files to Squarespace's
File Manager and filling in those URLs, the live site has **zero**
external runtime dependencies — no jsDelivr, no GitHub fetch. The
source repo can be flipped to private and the live site keeps
working.

The snippets are auto-regenerated on every `npm run build`. Paste
into **Settings → Advanced → Code Injection** (Page Header for the
target page), not a regular Code Block — Code Blocks have a
tighter character limit.

### Option B — jsDelivr CDN (smaller paste; public repo only)

`docs/squarespace-inline.html` and `docs/squarespace-popup.html`
fetch the bundle from **jsDelivr's free public-GitHub CDN** off
this repo's `dist/` directory. No account, no billing — the
`gh/<user>/<repo>` route is free for public repos. See
[`EMBED.md`](EMBED.md) for the recipe.

### Why jsDelivr

| Need | Why jsDelivr | Squarespace `/s/` |
|---|---|---|
| ES-module MIME type | yes | **no** — serves `text/plain` |
| CORS for module fetch | yes (`*`) | **no** |
| Cache headers | yes, long TTL | yes |
| Free for public repos | yes | yes |

Squarespace's own file uploader can serve `site.geojson` +
`level-1*.svg` correctly (plain JSON / SVG MIME is fine there)
— see `SCC_WAYFINDER_CONFIG.geojsonUrl`, `.level1Url`,
`.topClusterUrl`, etc., in the snippets if a self-hosted fallback
is ever needed. Only the ES-module bundle (`wayfinder.js`)
requires a real CDN.

### Known limitations

- **Stale edge cache on `@main`.** jsDelivr's edges advertise a
  ~12-hour TTL on branch-tip URLs but can hold stale much
  longer in practice. We hit this twice during development.
  **Always pin the snippet URLs to a commit SHA**
  (`@d35c2fd/dist/...`), not `@main`. The deploy workflow
  already does this automatically — `docs/squarespace-*.html`
  carries the latest SHA after every push.
- **50 MB per file.** Bundle is ~96 KB so this is academic.
- **Purge is rate-limited.** A handful of requests per minute
  via `https://purge.jsdelivr.net/gh/<user>/<repo>@<branch>/<path>`.
  Pinning to commit SHAs sidesteps the purge dance entirely
  because every deploy produces a fresh URL.
- **Public repo only — flipping to private kills the wayfinder.**
  jsDelivr's `gh/` route serves public repos exclusively. The
  moment the GitHub repo's visibility flips to private, every
  visitor of `southcommoncentre.ca/wff` will see "Couldn't load
  the wayfinder bundle" until either the repo is made public
  again or the snippet is repointed at a different host
  (GitHub Pages on a `gh-pages` branch, a Vercel or Netlify
  static deploy, or any other CDN that supports ES-module MIME
  + CORS). This is the single biggest operational gotcha; we
  hit it during initial setup. If a private-source workflow is
  needed, the typical pattern is: keep the source repo private,
  publish the `dist/` directory to a separate public repo (or
  to `gh-pages`) on each build, and point jsDelivr at that.
- **No formal SLA.** Track record has been ~99.99% but there's
  no contract. Alternates: `cdn.statically.io/gh/...`,
  `raw.githack.com`, GitHub Pages.

### Deploy workflow

After every commit on `main` that changes `dist/`:

1. `npm run build` — produces fresh `dist/wayfinder.{js,css}` +
   maps assets.
2. `git add -A && git commit -m "<reason>"`.
3. `git push`.
4. `sed -i "s|@<old-sha>/dist|@$(git rev-parse --short=7 HEAD)/dist|g" docs/squarespace-*.html`
   and bump the `?v=<token>` cache-bust.
5. `git add docs/ && git commit -m "pin snippet URLs to commit ..." && git push`.
6. Paste either `docs/squarespace-inline.html` or
   `docs/squarespace-popup.html` into the matching Squarespace
   Code Block.

The `?v=<token>` query bust forces visitors' browsers to refetch
the module even if they have an old version cached locally.

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
