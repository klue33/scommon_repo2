#!/usr/bin/env node
/**
 * Post-build: stitch dist/wayfinder.{js,css} into a single
 * paste-into-Squarespace Code Injection snippet, with placeholder
 * slots for the five asset URLs (operator uploads to Squarespace's
 * File Manager and fills these in once).
 *
 * Run automatically after `vite build` via the package.json build
 * script. Re-run by itself with: `node scripts/inline-bundle.mjs`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const js  = readFileSync(resolve(root, "dist/wayfinder.js"), "utf8");
const css = readFileSync(resolve(root, "dist/wayfinder.css"), "utf8");

// Sentinel block so the operator finds the asset-URL slots fast.
const FENCE = "// === FILL THESE FIVE URLS AFTER UPLOADING ASSETS TO SQUARESPACE === //";

const html = `<!--
  South Common Wayfinder — fully inlined Code Injection snippet.

  ZERO external dependencies after the asset upload step. The
  bundle, the stylesheet, and the config block all live inside
  this single snippet. After pasting, the live wayfinder works
  even if jsDelivr is down and the GitHub repo is private.

  ONE-TIME SETUP (in Squarespace):

    1. Go to Settings > Advanced > File Manager (or any page where
       you can upload static files). Upload the FIVE asset files
       below — they all live in this repo at public/maps/:
         - site.geojson
         - level-1.svg
         - level-1-cluster-top.svg
         - level-1-cluster-mid.svg
         - level-1-cluster-right.svg
       After upload, Squarespace gives each file an absolute URL
       (usually under https://static1.squarespace.com/... or
       https://southcommoncentre.ca/s/<file>). Copy each URL.

    2. Settings > Advanced > Code Injection > Page Header (for the
       wayfinder page only) — paste this entire snippet.

    3. Find the block marked "${FENCE}" below and replace each
       'PASTE_URL_HERE' with the matching uploaded URL from step 1.

    4. Save. The wayfinder mounts into the <div id="scc-wayfinder">
       on the page.

  UPDATING the bundle:
    Re-run \`npm run build\` locally — that regenerates this file
    from the fresh dist/ contents. Copy the whole new snippet,
    paste over the old one in Code Injection. The asset URLs from
    step 1 don't need to change unless the asset FILES changed too.

  WHY this exists:
    Eliminates the dependency on jsDelivr's public-GitHub CDN, so
    the source GitHub repo can be flipped to private without
    breaking the live site. See README.md for the deployment
    section that explains the trade-offs.
-->

<style>
${css}
</style>

<div id="scc-wayfinder" style="height: 82vh; min-height: 600px;"></div>

<script>
  ${FENCE}
  window.SCC_WAYFINDER_CONFIG = window.SCC_WAYFINDER_CONFIG || {};
  window.SCC_WAYFINDER_CONFIG.geojsonUrl      = 'PASTE_URL_HERE_site.geojson';
  window.SCC_WAYFINDER_CONFIG.level1Url       = 'PASTE_URL_HERE_level-1.svg';
  window.SCC_WAYFINDER_CONFIG.topClusterUrl   = 'PASTE_URL_HERE_level-1-cluster-top.svg';
  window.SCC_WAYFINDER_CONFIG.midClusterUrl   = 'PASTE_URL_HERE_level-1-cluster-mid.svg';
  window.SCC_WAYFINDER_CONFIG.rightClusterUrl = 'PASTE_URL_HERE_level-1-cluster-right.svg';
</script>

<script type="module">
${js}
</script>
`;

const out = resolve(root, "docs/squarespace-inline-bundle.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes — js ${js.length}, css ${css.length})`);

// ---------------------------------------------------------------
// Popup-launcher variant: same inlined bundle, wrapped in a "Find
// route" pill that opens a modal. Used when the wayfinder lives on
// a category / home page rather than a dedicated /wayfinder page.
// ---------------------------------------------------------------
const popupHtml = `<!--
  South Common Wayfinder — popup launcher (FULLY INLINED, no CDN).

  Pasted-once snippet that drops a "Find route" pill button on the
  page. Clicking opens a modal with the wayfinder. Bundle + CSS are
  inlined directly — zero external dependencies after the asset
  upload step. Source repo can be private without breaking this.

  ONE-TIME SETUP (in Squarespace):

    1. Upload the FIVE asset files from this repo's public/maps/
       directory to your Squarespace File Manager:
         - site.geojson
         - level-1.svg
         - level-1-cluster-top.svg
         - level-1-cluster-mid.svg
         - level-1-cluster-right.svg

    2. Settings > Advanced > Code Injection > Page Header (for the
       page where you want the popup launcher). Paste this entire
       snippet.

    3. Find the "${FENCE}" block below and replace each
       'PASTE_URL_HERE_...' with the matching uploaded URL.

    4. Save. The pill button shows on the page; clicking it opens
       the wayfinder in a modal that fills the viewport.

  UPDATING:
    \`npm run build\` regenerates this file from fresh dist/ output.
    Copy the new version and paste over the old Code Injection.

  WHY THIS EXISTS:
    Identical functionality to the dedicated-page inline bundle
    (docs/squarespace-inline-bundle.html) but wrapped in a popup
    launcher for non-dedicated pages.
-->

<style>
  /* Popup chrome — scoped under .scc-wf-popup so it can't collide
     with Squarespace template selectors. */
  .scc-wf-popup__launch {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 18px; border: none; border-radius: 999px;
    background: hsla(var(--accent-hsl, 17, 100%, 57%), 1);
    color: hsla(var(--white-hsl, 60, 9%, 98%), 1);
    font: 700 13px/1 'Clarkson', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    letter-spacing: 0.08em; text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }
  .scc-wf-popup__launch:hover { filter: brightness(0.95); }
  .scc-wf-popup__overlay {
    position: fixed; inset: 0;
    background: rgba(20, 18, 14, 0.62);
    z-index: 9500;
    display: none;
    align-items: stretch; justify-content: center;
  }
  .scc-wf-popup__overlay.is-open { display: flex; }
  .scc-wf-popup__panel {
    margin: 4vmin auto;
    width: min(94vw, 1400px); height: 92vh;
    background: hsla(var(--white-hsl, 60, 9%, 98%), 1);
    border-radius: 14px; overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  }
  .scc-wf-popup__head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid hsla(var(--lightAccent-hsl, 32, 90%, 80%), 0.5);
    font: 700 14px/1 'Clarkson', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: hsla(var(--black-hsl, 0, 0%, 5%), 1);
  }
  .scc-wf-popup__close {
    border: none; background: transparent;
    color: hsla(var(--black-hsl, 0, 0%, 5%), 1);
    font: 700 18px/1 'Clarkson', sans-serif;
    cursor: pointer; padding: 4px 8px;
  }
  .scc-wf-popup__close:hover { color: hsla(var(--accent-hsl, 17, 100%, 57%), 1); }
  .scc-wf-popup__body { flex: 1; min-height: 0; position: relative; }
  .scc-wf-popup__body #scc-wayfinder { position: absolute; inset: 0; }
</style>

<!-- Wayfinder CSS (inlined from dist/wayfinder.css) -->
<style>
${css}
</style>

<button class="scc-wf-popup__launch" id="scc-wf-popup-launch" type="button">Find route</button>

<div class="scc-wf-popup__overlay" id="scc-wf-popup-overlay" aria-hidden="true">
  <div class="scc-wf-popup__panel" role="dialog" aria-modal="true" aria-label="South Common Wayfinder">
    <div class="scc-wf-popup__head">
      <span>South Common Wayfinder</span>
      <button class="scc-wf-popup__close" id="scc-wf-popup-close" type="button" aria-label="Close">✕</button>
    </div>
    <div class="scc-wf-popup__body">
      <div id="scc-wayfinder"></div>
    </div>
  </div>
</div>

<script>
  ${FENCE}
  window.SCC_WAYFINDER_CONFIG = window.SCC_WAYFINDER_CONFIG || {};
  window.SCC_WAYFINDER_CONFIG.geojsonUrl      = 'PASTE_URL_HERE_site.geojson';
  window.SCC_WAYFINDER_CONFIG.level1Url       = 'PASTE_URL_HERE_level-1.svg';
  window.SCC_WAYFINDER_CONFIG.topClusterUrl   = 'PASTE_URL_HERE_level-1-cluster-top.svg';
  window.SCC_WAYFINDER_CONFIG.midClusterUrl   = 'PASTE_URL_HERE_level-1-cluster-mid.svg';
  window.SCC_WAYFINDER_CONFIG.rightClusterUrl = 'PASTE_URL_HERE_level-1-cluster-right.svg';

  (function () {
    var bundleActivated = false;
    var overlay = document.getElementById('scc-wf-popup-overlay');
    var launch  = document.getElementById('scc-wf-popup-launch');
    var close   = document.getElementById('scc-wf-popup-close');

    function openPopup() {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (!bundleActivated) {
        bundleActivated = true;
        // The wayfinder bundle is already inlined below — it runs at
        // page load. By the time the popup opens, the bundle has
        // mounted into #scc-wayfinder. Nothing extra needed here.
      }
    }
    function closePopup() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    launch.addEventListener('click', openPopup);
    close.addEventListener('click', closePopup);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePopup(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closePopup();
    });
  })();
</script>

<!-- Wayfinder bundle (inlined from dist/wayfinder.js) -->
<script type="module">
${js}
</script>
`;
const popupOut = resolve(root, "docs/squarespace-popup-bundle.html");
writeFileSync(popupOut, popupHtml);
console.log(`wrote ${popupOut} (${popupHtml.length} bytes)`);
