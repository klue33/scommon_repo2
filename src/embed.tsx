/**
 * Embed entry point. Loaded inside Squarespace via a Code Block.
 *
 * Usage in Squarespace:
 *   <div id="scc-wayfinder"></div>
 *   <link rel="stylesheet" href=".../wayfinder.css" />
 *   <script type="module" src=".../wayfinder.js"></script>
 *
 * The script auto-mounts into #scc-wayfinder. Optional config via
 * `window.SCC_WAYFINDER_CONFIG` (target element id, deep-link
 * defaults).
 */
import { render } from "preact";
import { Wayfinder } from "./wayfinder";
import "./styles.css";

interface EmbedConfig {
  target?: string;
  initialCategory?: string;
  initialStore?: string;
  initialFrom?: string;
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
  const url = new URL(window.location.href);
  const initialStore = cfg.initialStore ?? url.searchParams.get("to") ?? undefined;
  const initialFrom = cfg.initialFrom ?? url.searchParams.get("from") ?? undefined;
  const initialCategory = cfg.initialCategory ?? url.searchParams.get("category") ?? undefined;
  // Dev-only foot-path editor: enable with ?edit=1 in the URL.
  const editMode = url.searchParams.get("edit") === "1";

  render(
    <Wayfinder
      initialCategory={initialCategory}
      initialStore={initialStore}
      initialFrom={initialFrom}
      editMode={editMode}
    />,
    el,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
