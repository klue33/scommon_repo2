import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import graphData from "@/data/graph.json";
import { type GraphNode } from "../lib/pathfind";
import { storeById, STORES, type Store, VIEW_BOX } from "../lib/stores";

interface Props {
  selectedStore?: Store | null;
  onSelectStore?: (s: Store) => void;
  /** When true, MapViewer renders the path-editor overlay + toolbar. */
  editMode?: boolean;
}

interface SiteFeature {
  type: "Feature";
  properties: {
    store_id: string; unit: string; name: string;
    category: string; vacant: boolean; centroid: [number, number];
  };
  geometry: { type: "Polygon"; coordinates: number[][][] };
}
interface SiteFeatureCollection { type: "FeatureCollection"; features: SiteFeature[]; }

type EditNodeType = "junction" | "kiosk" | "entrance-main" | "entrance-tenant";
type ToolMode = "pen" | EditNodeType;
interface EditNode { id: string; x: number; y: number; type: EditNodeType; label?: string; }
interface EditEdge { a: string; b: string; cost: number; }

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const CLICK_PX = 5;
const STORAGE_KEY = "scc-wayfinder:edit-graph";
const ROTATION_DEG = -22.5;             // map rotated CCW
const PEN_DOWNSAMPLE = 30;              // px between successive nodes derived from a stroke
const PEN_RAW_STEP = 4;                 // min screen-px between raw points sampled during a stroke
const SNAP_RADIUS = 22;                 // px in viewBox space for snapping stroke endpoints to existing nodes

export function MapViewer({
  selectedStore, onSelectStore, editMode = false,
}: Props) {
  const [collection, setCollection] = useState<SiteFeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(new URL("/maps/site.geojson", document.baseURI).toString())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`site.geojson ${r.status}`))))
      .then((data: SiteFeatureCollection) => { if (!cancelled) setCollection(data); })
      .catch((err) => console.error("[scc-wayfinder] failed to load site.geojson", err));
    return () => { cancelled = true; };
  }, []);

  // --- pan / zoom -------------------------------------------------
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; pid: number; moved: number; type: "pan" | "drag-node" | "stroke"; nodeId?: string } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rotRef = useRef<SVGGElement | null>(null);

  const [vx0, vy0, VW, VH] = VIEW_BOX;
  const vw = VW / zoom;
  const vh = VH / zoom;
  const vx = vx0 + pan.x;
  const vy = vy0 + pan.y;
  const viewBox = `${vx} ${vy} ${vw} ${vh}`;

  // --- selection pulse -------------------------------------------
  // Bumps every time selectedStore changes; used as part of the
  // selected polygon's React key so the CSS "attention" animation
  // restarts on every (re)selection — including selecting the same
  // store twice in a row.
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (selectedStore?.id) setPulseKey((k) => k + 1);
  }, [selectedStore?.id]);

  // --- editor state ----------------------------------------------
  const [editGraph, setEditGraph] = useState<{ nodes: EditNode[]; edges: EditEdge[] }>(
    () => loadInitialEditGraph(),
  );
  const [tool, setTool] = useState<ToolMode>("pen");
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [stroke, setStroke] = useState<Array<[number, number]>>([]);

  // Persist edits so a refresh doesn't blow away a tracing session.
  useEffect(() => {
    if (!editMode) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(editGraph)); } catch {}
  }, [editGraph, editMode]);

  // Backspace / Delete with a selected node removes it + adjacent edges.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!selectedEditId) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      e.preventDefault();
      setEditGraph((g) => ({
        nodes: g.nodes.filter((n) => n.id !== selectedEditId),
        edges: g.edges.filter((e2) => e2.a !== selectedEditId && e2.b !== selectedEditId),
      }));
      setSelectedEditId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, selectedEditId]);

  // Convert a screen-space pointer event into a coordinate in the
  // rotated `<g>`'s local space, which is the same coord system the
  // stored polygons + nodes use.
  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const rot = rotRef.current;
    if (!svg || !rot) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = rot.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // --- pointer handlers ------------------------------------------
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
  };

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element;
    const editNodeEl = target.closest("[data-edit-node-id]") as HTMLElement | null;
    const kioskEl = target.closest("[data-kiosk-id]");
    const storeEl = target.closest("[data-store-id]");

    // In edit mode, clicking on an existing edit-node starts a drag.
    if (editMode && editNodeEl) {
      dragRef.current = {
        x: e.clientX, y: e.clientY, pid: e.pointerId, moved: 0,
        type: "drag-node", nodeId: editNodeEl.dataset.editNodeId!,
      };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    // In edit mode + pen tool, pointerdown on map background starts a stroke.
    if (editMode && tool === "pen" && !storeEl && !kioskEl && !editNodeEl) {
      const p = svgPoint(e.clientX, e.clientY);
      setStroke([[p.x, p.y]]);
      dragRef.current = {
        x: e.clientX, y: e.clientY, pid: e.pointerId, moved: 0, type: "stroke",
      };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    // Otherwise, ignore clicks on store/kiosk shapes so their own
    // click handlers fire cleanly outside edit mode.
    if (!editMode && (storeEl || kioskEl)) return;
    dragRef.current = {
      x: e.clientX, y: e.clientY, pid: e.pointerId, moved: 0, type: "pan",
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dxs = e.clientX - d.x;
    const dys = e.clientY - d.y;
    d.moved += Math.abs(dxs) + Math.abs(dys);
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const scaleX = (VW / zoom) / rect.width;
    const scaleY = (VH / zoom) / rect.height;

    if (d.type === "pan") {
      setPan((p) => ({ x: p.x - dxs * scaleX, y: p.y - dys * scaleY }));
      d.x = e.clientX; d.y = e.clientY;
    } else if (d.type === "drag-node" && d.nodeId) {
      const { x, y } = svgPoint(e.clientX, e.clientY);
      const id = d.nodeId;
      setEditGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) => n.id === id ? { ...n, x: round1(x), y: round1(y) } : n),
        edges: g.edges.map((edge) => {
          if (edge.a !== id && edge.b !== id) return edge;
          const a = g.nodes.find((n) => n.id === edge.a);
          const b = g.nodes.find((n) => n.id === edge.b);
          if (!a || !b) return edge;
          const ax = a.id === id ? x : a.x;
          const ay = a.id === id ? y : a.y;
          const bx = b.id === id ? x : b.x;
          const by = b.id === id ? y : b.y;
          return { ...edge, cost: Math.round(Math.hypot(ax - bx, ay - by)) };
        }),
      }));
      d.x = e.clientX; d.y = e.clientY;
    } else if (d.type === "stroke") {
      // Only push another raw point if it moved enough in screen space.
      const step = Math.hypot(dxs, dys);
      if (step >= PEN_RAW_STEP) {
        const p = svgPoint(e.clientX, e.clientY);
        setStroke((s) => [...s, [p.x, p.y]]);
        d.x = e.clientX; d.y = e.clientY;
      }
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = dragRef.current;
    if (d?.pid === e.pointerId) svgRef.current?.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    if (!d) return;
    const wasClick = d.moved < CLICK_PX;

    // Pen stroke complete → commit to graph.
    if (d.type === "stroke") {
      const raw = stroke;
      setStroke([]);
      if (raw.length >= 2) commitStroke(raw);
      return;
    }

    if (!editMode) return;

    const target = e.target as Element;
    const onEditNode = target.closest("[data-edit-node-id]");
    const onUnit = target.closest("[data-store-id]");
    const onKiosk = target.closest("[data-kiosk-id]");

    if (wasClick && onEditNode) {
      const clickedId = (onEditNode as HTMLElement).dataset.editNodeId!;
      if (selectedEditId && selectedEditId !== clickedId) {
        toggleEdge(selectedEditId, clickedId);
        setSelectedEditId(null);
      } else if (selectedEditId === clickedId) {
        setSelectedEditId(null);
      } else {
        setSelectedEditId(clickedId);
      }
      return;
    }
    // Click on background with a point tool active → drop that kind of node.
    if (wasClick && d.type === "pan" && !onUnit && !onKiosk && tool !== "pen") {
      const { x, y } = svgPoint(e.clientX, e.clientY);
      addNodeAt(x, y, tool as EditNodeType);
    }
  };

  const commitStroke = (raw: Array<[number, number]>) => {
    const pts = downsample(raw, PEN_DOWNSAMPLE);
    if (pts.length < 2) return;
    setEditGraph((g) => {
      const newNodes: EditNode[] = [...g.nodes];
      const newEdges: EditEdge[] = [...g.edges];
      const ids: string[] = [];
      for (const [x, y] of pts) {
        // Snap to an existing nearby node so chained strokes join up.
        const near = nearestNode(newNodes, x, y, SNAP_RADIUS);
        if (near) {
          ids.push(near.id);
          continue;
        }
        const id = newId();
        newNodes.push({ id, x: round1(x), y: round1(y), type: "junction" });
        ids.push(id);
      }
      // Chain consecutive ids into edges (skipping duplicates and any
      // edges that already exist).
      for (let i = 1; i < ids.length; i++) {
        const a = ids[i - 1], b = ids[i];
        if (a === b) continue;
        const exists = newEdges.some(
          (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
        );
        if (exists) continue;
        const na = newNodes.find((n) => n.id === a)!;
        const nb = newNodes.find((n) => n.id === b)!;
        newEdges.push({ a, b, cost: Math.round(Math.hypot(na.x - nb.x, na.y - nb.y)) });
      }
      return { nodes: newNodes, edges: newEdges };
    });
  };

  const toggleEdge = (a: string, b: string) => {
    setEditGraph((g) => {
      const idx = g.edges.findIndex(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
      );
      if (idx >= 0) return { ...g, edges: g.edges.filter((_, i) => i !== idx) };
      const na = g.nodes.find((n) => n.id === a)!;
      const nb = g.nodes.find((n) => n.id === b)!;
      return { ...g, edges: [...g.edges, { a, b, cost: Math.round(Math.hypot(na.x - nb.x, na.y - nb.y)) }] };
    });
  };

  const addNodeAt = (x: number, y: number, type: EditNodeType) => {
    const id = newId();
    const node: EditNode = {
      id, x: round1(x), y: round1(y), type,
      label: type === "kiosk" ? `Kiosk ${countOf(editGraph.nodes, "kiosk") + 1}`
           : type === "entrance-main" ? "Main entrance"
           : type === "entrance-tenant" ? undefined
           : undefined,
    };
    setEditGraph((g) => ({ ...g, nodes: [...g.nodes, node] }));
    setSelectedEditId(id);
  };

  const downloadGraph = () => {
    const composed = composeGraph(editGraph);
    const json = JSON.stringify(composed, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "graph.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const resetGraph = () => {
    if (!confirm("Discard your edits and reload graph.json from disk?")) return;
    setEditGraph(loadInitialEditGraph(true));
    setSelectedEditId(null);
  };

  const clearAll = () => {
    if (!confirm("Wipe ALL junctions, kiosks, entrances and their edges? (Store nodes are kept.)")) return;
    setEditGraph({ nodes: [], edges: [] });
    setSelectedEditId(null);
  };

  // --- render -----------------------------------------------------
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  // Kiosks (main entrances) still render as informational markers on
  // the map, but are no longer click-to-route — routing has been
  // removed from the UI.
  const kiosks = (graphData.nodes as Array<GraphNode>).filter((n) => n.type === "kiosk");
  const cx = vx0 + VW / 2;
  const cy = vy0 + VH / 2;
  const rotateTransform = `rotate(${ROTATION_DEG} ${cx} ${cy})`;

  return (
    <div class={"scc-wf__viewer" + (editMode ? " is-editing" : "")}>
      <svg
        ref={svgRef}
        class="scc-wf__svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label="Site map"
      >
        <defs>
          <pattern id="scc-parking" patternUnits="userSpaceOnUse" width="26" height="68">
            <rect width="26" height="68" fill="hsla(var(--darkAccent-hsl, 180,1.96%,10%), 0.10)" />
            <line x1="13" y1="6" x2="13" y2="62"
                  stroke="hsla(var(--white-hsl, 60,9.09%,97.84%), 0.55)" stroke-width="1.2" />
          </pattern>
          <pattern id="scc-drive" patternUnits="userSpaceOnUse" width="40" height="40">
            <rect width="40" height="40" fill="hsla(var(--darkAccent-hsl, 180,1.96%,10%), 0.06)" />
          </pattern>
        </defs>

        <g ref={rotRef} transform={rotateTransform}>
          <rect class="scc-wf__lot" x={vx0} y={vy0} width={VW} height={VH} fill="url(#scc-drive)" />
          <rect class="scc-wf__lot-stalls" x={vx0} y={vy0} width={VW} height={VH} fill="url(#scc-parking)" />

          {collection?.features.map((f) => {
            const p = f.properties;
            const store = storeById(p.store_id);
            const isSelected = selectedStore?.id === p.store_id;
            const classes = [
              "scc-wf__unit",
              `scc-wf__unit--${p.category}`,
              p.vacant ? "is-vacant" : "",
              isSelected ? "is-selected" : "",
            ].filter(Boolean).join(" ");
            const d = polygonToPath(f.geometry.coordinates);
            return (
              <path
                key={isSelected ? `${p.store_id}-pulse-${pulseKey}` : p.store_id}
                class={classes} d={d}
                data-store-id={p.store_id}
                onClick={() => !editMode && store && onSelectStore?.(store)}
              >
                <title>{p.name} · #{p.unit}</title>
              </path>
            );
          })}

          {editMode && (
            <g class="scc-wf__edit-layer">
              {editGraph.edges.map((e, i) => {
                const a = editGraph.nodes.find((n) => n.id === e.a);
                const b = editGraph.nodes.find((n) => n.id === e.b);
                if (!a || !b) return null;
                return (
                  <line key={`ee-${i}`} class="scc-wf__edit-edge"
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                );
              })}
              {/* live pen stroke preview */}
              {stroke.length > 1 && (
                <polyline class="scc-wf__edit-stroke"
                          points={stroke.map(([x, y]) => `${x},${y}`).join(" ")} />
              )}
              {editGraph.nodes.map((n) => {
                const isSel = selectedEditId === n.id;
                const r =
                  n.type === "kiosk" ? 16 :
                  n.type === "entrance-main" ? 14 :
                  n.type === "entrance-tenant" ? 7 :
                  10;
                return (
                  <g
                    key={n.id}
                    class={`scc-wf__edit-node scc-wf__edit-node--${n.type}` + (isSel ? " is-selected" : "")}
                    data-edit-node-id={n.id}
                  >
                    <circle cx={n.x} cy={n.y} r={r} />
                    {(n.type === "kiosk" || n.type === "entrance-main") && (
                      <text x={n.x} y={n.y + r + 18} textAnchor="middle">
                        {n.label ?? (n.type === "kiosk" ? "KIOSK" : "MAIN")}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {collection?.features.map((f) => {
            if (selectedStore?.id !== f.properties.store_id) return null;
            const [lx, ly] = f.properties.centroid;
            return (
              <text key={`lbl-${f.properties.store_id}`} class="scc-wf__label"
                    x={lx} y={ly + 4} textAnchor="middle">
                {f.properties.name}
              </text>
            );
          })}

          {!editMode && kiosks.map((n) => {
            const label = n.label ?? n.id.replace(/^kiosk-/, "Kiosk ").toUpperCase();
            return (
              <g key={n.id} class="scc-wf__kiosk" data-kiosk-id={n.id}>
                <circle cx={n.x} cy={n.y} r={14} />
                <text x={n.x} y={n.y + 32} textAnchor="middle">{label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <div class="scc-wf__zoom">
        <button onClick={() => setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM))} aria-label="Zoom in">+</button>
        <button onClick={() => setZoom((z) => clamp(z / 1.2, MIN_ZOOM, MAX_ZOOM))} aria-label="Zoom out">−</button>
        <button onClick={reset} aria-label="Reset view">⟲</button>
      </div>

      {editMode && (
        <div class="scc-wf__editor">
          <div class="scc-wf__editor-title">Path editor</div>
          <div class="scc-wf__editor-row scc-wf__editor-tools">
            {([
              { id: "pen",              label: "✎ Pen (stroke)" },
              { id: "junction",         label: "○ Junction" },
              { id: "kiosk",            label: "● Kiosk" },
              { id: "entrance-main",    label: "▲ Main entrance" },
              { id: "entrance-tenant",  label: "◆ Tenant entrance" },
            ] as { id: ToolMode; label: string }[]).map((opt) => (
              <button
                key={opt.id}
                class={"scc-wf__tool" + (tool === opt.id ? " is-active" : "")}
                onClick={() => setTool(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p class="scc-wf__editor-hint">
            {tool === "pen"
              ? "Drag with a stylus or mouse to trace a walkway. Each stroke is sampled into nodes spaced ~30 px apart and joined as edges. Endpoints near existing nodes snap to them."
              : `Click empty space to drop a ${tool.replace("entrance-", "").replace("-", " ")}. Click a node to select it; click another node to toggle an edge. Drag to move; Backspace to delete.`}
          </p>
          <div class="scc-wf__editor-stats">
            {editGraph.nodes.length} node{editGraph.nodes.length === 1 ? "" : "s"} ·{" "}
            {editGraph.edges.length} edge{editGraph.edges.length === 1 ? "" : "s"}
            {selectedEditId && <> · sel <code>{selectedEditId.slice(0, 10)}</code></>}
          </div>
          <div class="scc-wf__editor-actions">
            <button onClick={downloadGraph} class="scc-wf__cta">Save graph.json</button>
            <button onClick={clearAll} class="scc-wf__cta scc-wf__cta--ghost">Clear</button>
            <button onClick={resetGraph} class="scc-wf__cta scc-wf__cta--ghost">Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

function polygonToPath(rings: number[][][]): string {
  return rings.map((ring) => {
    const cmds = ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`);
    return cmds.join(" ") + " Z";
  }).join(" ");
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function round1(n: number) { return Math.round(n * 10) / 10; }

function newId() {
  return `n-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function countOf(nodes: EditNode[], type: EditNodeType): number {
  return nodes.filter((n) => n.type === type).length;
}

function nearestNode(nodes: EditNode[], x: number, y: number, maxDist: number): EditNode | null {
  let best: { node: EditNode; d: number } | null = null;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= maxDist && (!best || d < best.d)) best = { node: n, d };
  }
  return best?.node ?? null;
}

function downsample(points: Array<[number, number]>, minDist: number): Array<[number, number]> {
  if (points.length === 0) return [];
  const out: Array<[number, number]> = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    const [x, y] = points[i];
    if (Math.hypot(x - last[0], y - last[1]) >= minDist) out.push([x, y]);
  }
  // Always include the last raw point so the stroke ends where the
  // user lifted the stylus.
  const final = points[points.length - 1];
  const tail = out[out.length - 1];
  if (final[0] !== tail[0] || final[1] !== tail[1]) out.push(final);
  return out;
}

function loadInitialEditGraph(forceDisk = false): { nodes: EditNode[]; edges: EditEdge[] } {
  if (!forceDisk && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.nodes && parsed?.edges) return parsed;
      }
    } catch {}
  }
  const editable: EditNode[] = (graphData.nodes as any[])
    .filter((n) => n.type === "junction" || n.type === "kiosk")
    .map((n) => ({ id: n.id, x: n.x, y: n.y, type: n.type, label: n.label }));
  const ids = new Set(editable.map((n) => n.id));
  const edges: EditEdge[] = (graphData.edges as any[])
    .filter((e) => ids.has(e.a) && ids.has(e.b))
    .map((e) => ({ a: e.a, b: e.b, cost: e.cost }));
  return { nodes: editable, edges };
}

function composeGraph(edit: { nodes: EditNode[]; edges: EditEdge[] }) {
  const storeNodes = STORES
    .filter((s) => s.centroid)
    .map((s) => ({
      id: s.id, x: s.centroid![0], y: s.centroid![1],
      type: "store" as const, store: s.id,
    }));
  const snapEdges: EditEdge[] = [];
  for (const sn of storeNodes) {
    let best: { id: string; d: number } | null = null;
    for (const en of edit.nodes) {
      const d = Math.hypot(en.x - sn.x, en.y - sn.y);
      if (!best || d < best.d) best = { id: en.id, d };
    }
    if (best) snapEdges.push({ a: best.id, b: sn.id, cost: Math.round(best.d) });
  }
  return {
    nodes: [...edit.nodes, ...storeNodes],
    edges: [...edit.edges, ...snapEdges],
  };
}
