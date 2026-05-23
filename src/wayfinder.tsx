import { useEffect, useMemo, useState } from "preact/hooks";
import { CATEGORIES, STORES, searchStores, storeById, type Store } from "./lib/stores";
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

type Slot = "from" | "to";

function kioskLabel(k: GraphNode): string {
  return k.label ?? k.id.replace(/^kiosk-/, "Kiosk ").toUpperCase();
}

function nodeLabel(id: string | null): string {
  if (!id) return "";
  const k = KIOSKS.find((x) => x.id === id);
  if (k) return kioskLabel(k);
  const s = storeById(id);
  if (s) return s.name;
  return id;
}

function nodeKind(id: string | null): "kiosk" | "store" | null {
  if (!id) return null;
  if (KIOSKS.some((k) => k.id === id)) return "kiosk";
  if (storeById(id)) return "store";
  return null;
}

export function Wayfinder({ initialCategory, initialStore, fromKiosk, editMode }: Props) {
  const seeded = initialStore ? storeById(initialStore) ?? null : null;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(seeded?.category ?? initialCategory ?? null);

  // Two-slot directions model:
  // - `from`  : any graph node id (kiosk or store) — the starting point
  // - `to`    : a store id — the destination
  // - `active`: which slot is currently being filled by clicks
  const [from, setFrom] = useState<string | null>(fromKiosk ?? null);
  const [to, setTo] = useState<string | null>(seeded?.id ?? null);
  const [active, setActive] = useState<Slot>(seeded ? "from" : "from");

  // The "selected store" for the map highlight + detail panel
  // follows whichever slot most recently changed; default to To if set.
  const selected = useMemo<Store | null>(() => {
    if (to) return storeById(to) ?? null;
    if (from && nodeKind(from) === "store") return storeById(from) ?? null;
    return null;
  }, [from, to]);

  const visible = useMemo(() => {
    let xs = searchStores(query, STORES);
    if (category) xs = xs.filter((s) => s.category === category);
    return xs;
  }, [query, category]);

  // Assigning to a slot from the list / map: drop into the active
  // slot, then advance From → To.
  const assign = (id: string) => {
    if (active === "from") {
      setFrom(id);
      // Don't auto-advance if To is already set or if the user
      // just clicked the same id that's already in To.
      if (!to) setActive("to");
    } else {
      // To slot should hold a store, not a kiosk; fall back to From
      // when the user picks a kiosk while To is active.
      if (nodeKind(id) === "kiosk") {
        setFrom(id);
        setActive("to");
      } else {
        setTo(id);
      }
    }
  };

  const clearAll = () => { setFrom(null); setTo(null); setActive("from"); };
  const swap = () => {
    // Only swap if From is a store (otherwise the swap would put a
    // kiosk in the To slot which doesn't make sense).
    if (nodeKind(from) === "store") {
      const a = from, b = to;
      setFrom(b); setTo(a);
    } else if (from && to) {
      // From is a kiosk: move the destination store to From and the
      // old From-kiosk evaporates (kiosks aren't valid as To).
      setFrom(to); setTo(null); setActive("to");
    }
  };

  // Whenever the To slot is filled by something other than clicking
  // the list (e.g. clicking a unit on the map), reflect it in the
  // category filter so the row shows up in the directory.
  useEffect(() => {
    if (!to) return;
    const s = storeById(to);
    if (s && category && s.category !== category) setCategory(null);
  }, [to]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div class="scc-wf">
      <aside class="scc-wf__sidebar">
        <h1 class="scc-wf__title">South Common Centre</h1>

        <div class="scc-wf__directions" role="group" aria-label="Directions">
          <button
            class={"scc-wf__slot" + (active === "from" ? " is-active" : "")}
            onClick={() => setActive("from")}
            type="button"
          >
            <span class="scc-wf__slot-label">From</span>
            <span class="scc-wf__slot-value">
              {from ? nodeLabel(from) : "Pick a start point…"}
            </span>
            {from && (
              <span
                class="scc-wf__slot-clear"
                role="button"
                tabindex={0}
                aria-label="Clear From"
                onClick={(e) => { e.stopPropagation(); setFrom(null); setActive("from"); }}
              >✕</span>
            )}
          </button>
          <button
            class={"scc-wf__slot" + (active === "to" ? " is-active" : "")}
            onClick={() => setActive("to")}
            type="button"
          >
            <span class="scc-wf__slot-label">To</span>
            <span class="scc-wf__slot-value">
              {to ? nodeLabel(to) : "Pick a destination…"}
            </span>
            {to && (
              <span
                class="scc-wf__slot-clear"
                role="button"
                tabindex={0}
                aria-label="Clear To"
                onClick={(e) => { e.stopPropagation(); setTo(null); setActive("to"); }}
              >✕</span>
            )}
          </button>
          <div class="scc-wf__directions-actions">
            <button
              type="button"
              class="scc-wf__cta scc-wf__cta--ghost"
              onClick={swap}
              disabled={!from || !to}
            >⇄ Swap</button>
            <button
              type="button"
              class="scc-wf__cta scc-wf__cta--ghost"
              onClick={clearAll}
              disabled={!from && !to}
            >Clear</button>
          </div>
        </div>

        <input
          class="scc-wf__search"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder={active === "from" ? "Find a start point…" : "Search stores…"}
          aria-label="Search"
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
          {/* Entrances pinned at the top so they're pickable as a
              start point (or, oddly but legally, a destination). */}
          <li class="scc-wf__list-header">Entrances</li>
          {KIOSKS.map((k) => (
            <li key={k.id}>
              <button
                class={"scc-wf__item scc-wf__item--kiosk" +
                  (from === k.id || to === k.id ? " is-active" : "")}
                onClick={() => assign(k.id)}
              >
                <strong>{kioskLabel(k)}</strong>
                <span class="scc-wf__unit">ENTRY</span>
              </button>
            </li>
          ))}
          <li class="scc-wf__list-header">Stores</li>
          {visible.map((s) => (
            <li key={s.id}>
              <button
                class={"scc-wf__item" +
                  (from === s.id ? " is-active scc-wf__item--from" : "") +
                  (to === s.id ? " is-active scc-wf__item--to" : "")}
                onClick={() => assign(s.id)}
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
          routeFrom={from ?? undefined}
          onSelectStore={(s) => assign(s.id)}
          onSelectKiosk={(id) => assign(id)}
          editMode={editMode}
        />

        {selected && (
          <div class="scc-wf__detail" role="complementary">
            <h2>{selected.name}</h2>
            <div class="scc-wf__meta">
              Unit {selected.unit} ·{" "}
              {CATEGORIES.find((c) => c.id === selected.category)?.label ?? selected.category}
              {selected.vacant && <> · <em>available for lease</em></>}
            </div>
            {from && to ? (
              <div class="scc-wf__route-info">
                Routing from <strong>{nodeLabel(from)}</strong>
              </div>
            ) : (
              <div class="scc-wf__route-info scc-wf__route-info--hint">
                {active === "from"
                  ? "Pick a start point from the list (or click a kiosk on the map)."
                  : "Pick a destination from the list or click a unit on the map."}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
