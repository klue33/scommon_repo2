import { useMemo, useState } from "preact/hooks";
import { CATEGORIES, STORES, searchStores, type Store } from "./lib/stores";

interface Props {
  initialFloor?: 1 | 2 | 3;
  initialStore?: string;
  fromKiosk?: string;
}

export function Wayfinder({ initialFloor = 1, initialStore, fromKiosk }: Props) {
  const seeded = initialStore ? STORES.find((s) => s.id === initialStore) ?? null : null;
  const [floor, setFloor] = useState<1 | 2 | 3>(seeded?.floor ?? initialFloor);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
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
        <div class="scc-wf__chips" role="tablist">
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
                onClick={() => { setSelected(s); setFloor(s.floor); }}
              >
                <strong>{s.name}</strong>
                <span class="scc-wf__unit">{s.unit}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li class="scc-wf__empty">No stores match.</li>}
        </ul>
      </aside>

      <section class="scc-wf__map">
        <div class="scc-wf__floors" role="tablist" aria-label="Floor">
          {([1, 2, 3] as const).map((f) => (
            <button
              key={f}
              class={"scc-wf__floor" + (floor === f ? " is-active" : "")}
              onClick={() => setFloor(f)}
              aria-pressed={floor === f}
            >
              L{f}
            </button>
          ))}
        </div>

        <div class="scc-wf__canvas" aria-label={`Map level ${floor}`}>
          {/* TODO: <MapViewer floor={floor} highlight={selected?.id} fromKiosk={fromKiosk} /> */}
          <div class="scc-wf__placeholder">
            Level {floor} — SVG floor plan goes here
          </div>
        </div>

        {selected && (
          <div class="scc-wf__detail" role="complementary">
            <h2>{selected.name}</h2>
            <div class="scc-wf__meta">{selected.unit} · Level {selected.floor}</div>
            <button class="scc-wf__cta">
              Directions{fromKiosk ? " from kiosk" : ""}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
