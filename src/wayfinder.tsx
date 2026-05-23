import { useMemo, useState } from "preact/hooks";
import { CATEGORIES, STORES, searchStores, storeById, type Store } from "./lib/stores";
import { MapViewer } from "./components/MapViewer";

interface Props {
  initialCategory?: string;
  initialStore?: string;
  editMode?: boolean;
}

export function Wayfinder({ initialCategory, initialStore, editMode }: Props) {
  const seeded = initialStore ? storeById(initialStore) ?? null : null;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(seeded?.category ?? initialCategory ?? null);
  const [selected, setSelected] = useState<Store | null>(seeded);

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
          onSelectStore={(s) => setSelected(s)}
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
          </div>
        )}
      </section>
    </div>
  );
}
