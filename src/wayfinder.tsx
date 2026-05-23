import { useMemo, useState } from "preact/hooks";
import { CATEGORIES, STORES, searchStores, type Store } from "./lib/stores";
import { MapViewer } from "./components/MapViewer";

interface Props {
  initialCategory?: string;
  initialStore?: string;
  fromKiosk?: string;
}

// Until a "Choose your starting kiosk" picker exists, fall back to
// the first kiosk so the routing layer renders something the moment
// a store is selected.
const FALLBACK_KIOSK = "kiosk-a";

export function Wayfinder({ initialCategory, initialStore, fromKiosk }: Props) {
  const seeded = initialStore ? STORES.find((s) => s.id === initialStore) ?? null : null;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(seeded?.category ?? initialCategory ?? null);
  const [selected, setSelected] = useState<Store | null>(seeded);
  const [showRoute, setShowRoute] = useState<boolean>(Boolean(fromKiosk));

  const routeFrom = showRoute ? (fromKiosk ?? FALLBACK_KIOSK) : undefined;

  const visible = useMemo(() => {
    let xs = searchStores(query, STORES);
    if (category) xs = xs.filter((s) => s.category === category);
    return xs;
  }, [query, category]);

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
          routeFrom={routeFrom}
          onSelectStore={(s) => setSelected(s)}
        />

        {selected && (
          <div class="scc-wf__detail" role="complementary">
            <h2>{selected.name}</h2>
            <div class="scc-wf__meta">
              Unit {selected.unit} ·{" "}
              {CATEGORIES.find((c) => c.id === selected.category)?.label ?? selected.category}
            </div>
            <div class="scc-wf__actions">
              <button class="scc-wf__cta" onClick={() => setShowRoute(true)}>
                {showRoute ? "Routing…" : "Get directions"}
              </button>
              {showRoute && (
                <button
                  class="scc-wf__cta scc-wf__cta--ghost"
                  onClick={() => setShowRoute(false)}
                >
                  Clear route
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
