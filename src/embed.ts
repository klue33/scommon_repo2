/**
 * Embed entry point. Loaded inside Squarespace via a Code Block.
 *
 * Usage in Squarespace:
 *   <div id="scc-wayfinder"></div>
 *   <link rel="stylesheet" href=".../wayfinder.css" />
 *   <script type="module" src=".../wayfinder.js"></script>
 *
 * The script auto-mounts into #scc-wayfinder. Optional config is read
 * from `window.SCC_WAYFINDER_CONFIG` if present (target element id,
 * initial floor, etc.) — set it on the same page above the <script>
 * tag.
 */
import { render } from "preact";
import { Wayfinder } from "./wayfinder";
import "./styles.css";

interface EmbedConfig {
  target?: string;       // element id, default "scc-wayfinder"
  initialFloor?: 1 | 2 | 3;
  initialStore?: string; // store slug to deep-link to
  fromKiosk?: string;    // kiosk node id for "from"
}

declare global {
  interface Window {
    SCC_WAYFINDER_CONFIG?: EmbedConfig;
  }
}

function mount() {
  const cfg = window.SCC_WAYFINDER_CONFIG ?? {};
  const el = document.getElementById(cfg.target ?? "scc-wayfinder");
  if (!el) {
    console.warn("[scc-wayfinder] target element not found");
    return;
  }
  // Also honour URL params so QR / push links work without extra wiring.
  const url = new URL(window.location.href);
  const initialStore = cfg.initialStore ?? url.searchParams.get("to") ?? undefined;
  const fromKiosk = cfg.fromKiosk ?? url.searchParams.get("from") ?? undefined;
  const initialFloor = cfg.initialFloor ?? (Number(url.searchParams.get("floor")) as 1 | 2 | 3 | undefined);

  render(
    <Wayfinder
      initialFloor={initialFloor && [1, 2, 3].includes(initialFloor) ? initialFloor : 1}
      initialStore={initialStore}
      fromKiosk={fromKiosk}
    />,
    el,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
