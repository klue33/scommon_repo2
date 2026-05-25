import { useEffect, useMemo, useState } from "preact/hooks";
import { CATEGORIES, STORES, searchStores, storeById, type Store } from "./lib/stores";
import { MapViewer } from "./components/MapViewer";

interface Props {
  initialCategory?: string;
  initialStore?: string;
  initialFrom?: string;
  editMode?: boolean;
}

/**
 * Two-endpoint picking model: the visitor sets a destination ("to")
 * and optionally an origin ("from"). With both set, the map renders
 * a route polyline that follows graph edges only (no off-graph
 * shortcuts) — see tests/pathfind.test.ts ("routes tenant → tenant
 * strictly along graph edges").
 *
 * Click behavior on a store tile:
 *   pickMode === "to"    → set destination
 *   pickMode === "from"  → set origin, then flip back to "to"
 */
export function Wayfinder({
  initialCategory, initialStore, initialFrom, editMode,
}: Props) {
  const seededTo = initialStore ? storeById(initialStore) ?? null : null;
  const seededFrom = initialFrom ? storeById(initialFrom) ?? null : null;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(
    seededTo?.category ?? initialCategory ?? null,
  );
  const [to, setTo] = useState<Store | null>(seededTo);
  const [from, setFrom] = useState<Store | null>(seededFrom);
  const [pickMode, setPickMode] = useState<"to" | "from">("to");

  const visible = useMemo(() => {
    let xs = searchStores(query, STORES);
    if (category) xs = xs.filter((s) => s.category === category);
    return xs;
  }, [query, category]);

  // Keep the URL in sync so the route is shareable / QR-codable.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (to) url.searchParams.set("to", to.id);
    else url.searchParams.delete("to");
    if (from) url.searchParams.set("from", from.id);
    else url.searchParams.delete("from");
    window.history.replaceState(null, "", url.toString());
  }, [to?.id, from?.id]);

  const onPickStore = (s: Store) => {
    if (pickMode === "from") {
      setFrom(s);
      setPickMode("to");
    } else {
      setTo(s);
    }
  };

  const clearAll = () => { setFrom(null); setTo(null); setPickMode("to"); };

  return (
    <div class="scc-wf">
      <aside class="scc-wf__sidebar">
        <h1 class="scc-wf__title">South Common Centre</h1>

        {(from || to) && (
          <div class="scc-wf__route-bar" role="status">
            <div class="scc-wf__route-leg">
              <label>From</label>
              <button
                class={"scc-wf__route-slot" + (pickMode === "from" ? " is-active" : "")}
                onClick={() => setPickMode("from")}
                aria-label={from ? `Change starting point. Currently ${from.name}.` : "Set starting point"}
              >
                {from ? from.name : <em>tap a store to set</em>}
              </button>
              {from && (
                <button class="scc-wf__route-x" onClick={() => setFrom(null)} aria-label="Clear starting point">×</button>
              )}
            </div>
            <div class="scc-wf__route-arrow" aria-hidden="true">→</div>
            <div class="scc-wf__route-leg">
              <label>To</label>
              <button
                class={"scc-wf__route-slot" + (pickMode === "to" ? " is-active" : "")}
                onClick={() => setPickMode("to")}
                aria-label={to ? `Change destination. Currently ${to.name}.` : "Set destination"}
              >
                {to ? to.name : <em>tap a store to set</em>}
              </button>
              {to && (
                <button class="scc-wf__route-x" onClick={() => setTo(null)} aria-label="Clear destination">×</button>
              )}
            </div>
            <button class="scc-wf__route-clear" onClick={clearAll}>Clear</button>
          </div>
        )}

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
          >All</button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              class={"scc-wf__chip" + (category === c.id ? " is-active" : "")}
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
            >{c.label}</button>
          ))}
        </div>

        <ul class="scc-wf__list">
          {visible.map((s) => {
            const isTo = to?.id === s.id;
            const isFrom = from?.id === s.id;
            return (
              <li key={s.id}>
                <button
                  class={"scc-wf__item"
                    + (isTo ? " is-to" : "")
                    + (isFrom ? " is-from" : "")}
                  onClick={() => onPickStore(s)}
                >
                  <strong>{s.name}</strong>
                  <span class="scc-wf__unit">#{s.unit}</span>
                  {isFrom && <span class="scc-wf__tag">From</span>}
                  {isTo   && <span class="scc-wf__tag">To</span>}
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li class="scc-wf__empty">No stores match.</li>}
        </ul>
      </aside>

      <section class="scc-wf__map">
        <MapViewer
          fromStore={from}
          toStore={to}
          onSelectStore={onPickStore}
          editMode={editMode}
        />

        {to && (
          <div class="scc-wf__detail" role="complementary">
            <h2>{to.name}</h2>
            <div class="scc-wf__meta">
              Unit {to.unit} ·{" "}
              {CATEGORIES.find((c) => c.id === to.category)?.label ?? to.category}
              {to.vacant && <> · <em>available for lease</em></>}
            </div>
            <div class="scc-wf__detail-actions">
              {!from && (
                <button class="scc-wf__btn" onClick={() => setPickMode("from")}>
                  Directions from another store →
                </button>
              )}
              {from && from.id !== to.id && (
                <span class="scc-wf__route-summary">
                  Route shown from <strong>{from.name}</strong>.
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
