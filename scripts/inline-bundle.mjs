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
