# Embedding into Squarespace

The wayfinder ships as a single ES-module bundle plus a stylesheet —
`dist/wayfinder.js` and `dist/wayfinder.css` after `pnpm build`. They
can be dropped into the existing SCC Squarespace site three ways,
listed from most-invasive to least.

## TL;DR — recommended setup

1. Build the bundle locally:
   ```bash
   pnpm install
   pnpm build
   ```
2. Host `dist/wayfinder.js` and `dist/wayfinder.css` somewhere with
   `Access-Control-Allow-Origin: *`. Options:
   - **Cloudflare Pages** (free, custom domain, auto HTTPS) — push the
     `dist/` folder, point at `wayfinder.southcommoncentre.ca` or
     similar.
   - **GitHub Pages** from this repo's `gh-pages` branch.
   - **jsDelivr** off the GitHub repo: `cdn.jsdelivr.net/gh/<user>/scc-wayfinder@<tag>/dist/wayfinder.js`.
   - Squarespace's own file uploader works in a pinch, but it
     fingerprints filenames on each upload — annoying for cache
     busting.
3. Edit the existing `/wayfinder` page in Squarespace. Replace the
   current SVG block with a **Code Block** (not Embed, not Markdown):

   ```html
   <link rel="stylesheet" href="https://wayfinder.southcommoncentre.ca/wayfinder.css">
   <div id="scc-wayfinder" style="height: 80vh; min-height: 600px;"></div>
   <script>
     window.SCC_WAYFINDER_CONFIG = {
       initialFloor: 1
       /* optional: initialStore: "winners", fromKiosk: "l1-kiosk-a" */
     };
   </script>
   <script type="module" src="https://wayfinder.southcommoncentre.ca/wayfinder.js"></script>
   ```
4. Save. The wayfinder inherits the SCC site palette via Squarespace's
   `--accent-hsl`, `--black-hsl`, `--white-hsl`, `--lightAccent-hsl`,
   and `--darkAccent-hsl` CSS variables — no theme tweak needed.

## Deep links

Once embedded, the bundle reads URL params:
- `?to=<store-slug>` selects a store and scrolls it into view.
- `?from=<kiosk-node-id>` sets the route origin.
- `?category=<slug>` opens the directory pre-filtered (e.g.
  `?category=restaurants`).

So a QR sticker on Kiosk A can link to
`southcommoncentre.ca/wayfinder?from=kiosk-a` and a tenant promo URL
can be `southcommoncentre.ca/wayfinder?to=winners`. SCC is a
single-level site, so there is no `?floor=` param.

## Colour scheme

Squarespace 7.1 exposes the site palette as `:root` CSS variables.
The embed reads them as `hsla(var(--accent-hsl), 1)` etc., so any
palette change made in **Site Styles → Colors** flows through
automatically. The bundle does NOT hard-code brand hex values into
the live site path — only as fallbacks for standalone dev.

If the operator later wants a separate palette for the wayfinder
without touching the site palette, scope an override on the
`/wayfinder` page via Squarespace's **Page Settings → Advanced →
Page Header Code Injection**:

```html
<style>
  #scc-wayfinder {
    --wf-accent: #FF6F23;
    --wf-bg:     #FAFAF7;
    --wf-ink:    #0D0D0D;
  }
</style>
```

(`--wf-*` variables are declared on `.scc-wf` and take precedence
over the Squarespace tokens.)

## Why Code Block, not iframe

Iframes:
- break deep-link URL params (the parent URL is the canonical one)
- block CSS variable inheritance from the parent page (palette has
  to be hard-coded)
- can't push history state (`?to=` deep links won't update the
  Squarespace URL bar)
- add a scrollbar and viewport-sizing headaches on mobile

Code Block injects the script into the same DOM as the rest of the
page — palette inheritance, deep links, and mobile sizing all work.

## Squarespace Developer Mode (optional)

If you have the site in Developer Mode (Settings → Developer Mode)
the cleanest path is to commit the embed snippet into the page's
`.region` template instead of a Code Block, and serve the JS/CSS
from the site's own `/assets/` directory. The mechanics of the
embed don't change; only the hosting location does.
