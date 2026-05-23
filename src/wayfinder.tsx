import { useMemo, useState } from "preact/hooks";
import { CATEGORIES, STORES, searchStores, type Store } from "./lib/stores";
import { MapViewer } from "./components/MapViewer";
import graphData from "@/data/graph.json";
import { type GraphNode } from "./lib/pathfind";

interface Props {
  initialCategory?: string;
  initialStore?: string;
  fromKiosk?: string;
  editMode?: boolean;
}

const KIOSKS: GraphNode[] = (graphData.nodes as GraphNode[]).filter(
  (n) => n.type === "kiosk",
);

function kioskLabel(k: GraphNode): string {
  return k.label ?? k.id.replace(/^kiosk-/, "Kiosk ").toUpperCase();
}

function defaultKioskId(preferred?: string): string {
  if (preferred && KIOSKS.some((k) => k.id === preferred)) return preferred;
  return KIOSKS[0]?.id ?? "";
}

export function Wayfinder({ initialCategory, initialStore, fromKiosk, editMode }: Props) {
  const seeded = initialStore ? STORES.find((s) => s.id === initialStore) ?? null : null;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(seeded?.category ?? initialCategory ?? null);
  const [selected, setSelected] = useState<Store | null>(seeded);
  // routeOrigin === null means "no route shown". A kiosk id means
  // "route from this kiosk to the selected store".
  const [routeOrigin, setRouteOrigin] = useState<string | null>(
    fromKiosk ? defaultKioskId(fromKiosk) : null,
  );

  const visible = useMemo(() => {
    let xs = searchStores(query, STORES);
    if (category) xs = xs.filter((s) => s.category === category);
    return xs;
  }, [query, category]);

  const startRoute = () => setRouteOrigin(defaultKioskId(fromKiosk));
  const clearRoute = () => setRouteOrigin(null);

  return (
    <div class="scc-wf">
      <aside class="scc-wf__sidebar">
        <h1 class="scc-wf__title">South Common Centre</h1>
        <input
          class="scc-wf__search"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Search stores…"
          aria-label="Search stores"
        />
        <div class="scc-wf__chips" role="tablist" aria-label="Category">
          <button
            class={"scc-wf__chip" + (category === null ? " is-active" : "")}
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              class={"scc-wf__chip" + (category === c.id ? " is-active" : "")}
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>
        <ul class="scc-wf__list">
          {visible.map((s) => (
            <li key={s.id}>
              <button
                class={"scc-wf__item" + (selected?.id === s.id ? " is-active" : "")}
                onClick={() => setSelected(s)}
              >
                <strong>{s.name}</strong>
                <span class="scc-wf__unit">#{s.unit}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li class="scc-wf__empty">No stores match.</li>}
        </ul>
      </aside>

      <section class="scc-wf__map">
        <MapViewer
          selectedStore={selected}
          routeFrom={routeOrigin ?? undefined}
          onSelectStore={(s) => setSelected(s)}
          onSelectKiosk={(id) => setRouteOrigin(id)}
          editMode={editMode}
        />

        {selected && (
          <div class="scc-wf__detail" role="complementary">
            <h2>{selected.name}</h2>
            <div class="scc-wf__meta">
              Unit {selected.unit} ·{" "}
              {CATEGORIES.find((c) => c.id === selected.category)?.label ?? selected.category}
            </div>

            {routeOrigin && KIOSKS.length > 0 && (
              <div class="scc-wf__from">
                <label class="scc-wf__from-label" for="scc-wf-from">From</label>
                <select
                  id="scc-wf-from"
                  class="scc-wf__from-select"
                  value={routeOrigin}
                  onChange={(e) => setRouteOrigin((e.target as HTMLSelectElement).value)}
                >
                  {KIOSKS.map((k) => (
                    <option key={k.id} value={k.id}>{kioskLabel(k)}</option>
                  ))}
                </select>
              </div>
            )}

            <div class="scc-wf__actions">
              {routeOrigin === null ? (
                <button class="scc-wf__cta" onClick={startRoute}>Get directions</button>
              ) : (
                <button class="scc-wf__cta scc-wf__cta--ghost" onClick={clearRoute}>
                  Clear route
                </button>
              )}
            </div>

            {routeOrigin === null && KIOSKS.length > 1 && (
              <p class="scc-wf__hint">Tip: click a kiosk pin on the map to route from there.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
