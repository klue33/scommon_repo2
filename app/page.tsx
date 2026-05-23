"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, STORES, searchStores, type Store } from "@/lib/stores";

export default function WayfinderPage() {
  const [floor, setFloor] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Store | null>(null);

  const visible = useMemo(() => {
    let xs = searchStores(query, STORES);
    if (category) xs = xs.filter((s) => s.category === category);
    return xs;
  }, [query, category]);

  return (
    <main style={{ display: "grid", gridTemplateColumns: "360px 1fr", height: "100vh" }}>
      <aside style={{ borderRight: "1px solid #ddd", padding: 16, overflow: "auto" }}>
        <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>South Common Centre</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stores…"
          style={{ width: "100%", padding: 8, fontSize: 14, marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => setCategory(null)} aria-pressed={category === null}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)} aria-pressed={category === c.id}>
              {c.label}
            </button>
          ))}
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visible.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => { setSelected(s); setFloor(s.floor); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 4px", border: 0, background: selected?.id === s.id ? "#eef" : "transparent" }}
              >
                <strong>{s.name}</strong> <span style={{ color: "#666" }}>{s.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section style={{ position: "relative", overflow: "hidden", background: "#fafafa" }}>
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 4, zIndex: 10 }}>
          {([1, 2, 3] as const).map((f) => (
            <button key={f} onClick={() => setFloor(f)} aria-pressed={floor === f}
              style={{ padding: "6px 12px", background: floor === f ? "#333" : "#fff", color: floor === f ? "#fff" : "#333" }}>
              L{f}
            </button>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
          {/* TODO: <MapViewer floor={floor} highlight={selected?.id} /> */}
          Map level {floor} placeholder — SVG not yet authored
        </div>
        {selected && (
          <div style={{ position: "absolute", right: 12, top: 12, background: "#fff", border: "1px solid #ddd", padding: 12, width: 260 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>{selected.name}</h2>
            <div style={{ color: "#666", fontSize: 13 }}>{selected.unit} · Level {selected.floor}</div>
            <button style={{ marginTop: 8 }}>Directions from kiosk</button>
          </div>
        )}
      </section>
    </main>
  );
}
