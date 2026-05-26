import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import graphData from "@/data/graph.json";
import { buildGraph, routeBetweenStores, type GraphNode } from "../lib/pathfind";
import { storeById, STORES, type Store, VIEW_BOX } from "../lib/stores";
import { parseGraphJson, addStraightLine, editNodeRadius, addBarrier } from "../lib/editor";

interface Props {
  /** The destination tenant. */
  toStore?: Store | null;
  /** The origin tenant. When both `fromStore` and `toStore` are set,
   *  a polyline is rendered along the graph edges between them. */
  fromStore?: Store | null;
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

type EditNodeType = "junction" | "kiosk" | "entrance-main" | "entrance-tenant" | "amenity-washroom" | "amenity-security";
type ToolMode = "pen" | "line" | "barrier" | EditNodeType;
const HISTORY_LIMIT = 50;
interface EditNode { id: string; x: number; y: number; type: EditNodeType; label?: string; }
interface EditEdge { a: string; b: string; cost: number; }
interface EditBarrier { id: string; a: [number, number]; b: [number, number]; }
type EditGraph = { nodes: EditNode[]; edges: EditEdge[]; barriers: EditBarrier[] };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const CLICK_PX = 5;
const STORAGE_KEY = "scc-wayfinder:edit-graph";
// Polygon data was affine-aligned to the level-1.svg backdrop's
// native coord system (1200×800), so no render-time rotation is
// needed. Keeping the constant + counter-rotation infra in place
// in case a future deploy wants to rotate again.
const ROTATION_DEG = 0;
const LABEL_COUNTER_ROTATION = -ROTATION_DEG;
const PEN_DOWNSAMPLE = 30;              // px between successive nodes derived from a stroke
const PEN_RAW_STEP = 4;                 // min screen-px between raw points sampled during a stroke
const SNAP_RADIUS = 22;                 // px in viewBox space for snapping stroke endpoints to existing nodes

export function MapViewer({
  toStore, fromStore, onSelectStore, editMode = false,
}: Props) {
  // `selectedStore` is preserved as an alias for code below that still
  // talks about "the highlighted polygon". The destination IS the
  // highlighted store — `fromStore` is the route origin, drawn but
  // not "selected" in the detail-panel sense.
  const selectedStore = toStore;
  const [collection, setCollection] = useState<SiteFeatureCollection | null>(null);

  // window.SCC_WAYFINDER_CONFIG.geojsonUrl lets operators self-host
  // the asset when jsDelivr is stale or when they need a private
  // CDN. Falls back to a URL relative to the bundle's own location
  // (import.meta.url) — NOT document.baseURI, which on Squarespace
  // points at the embedding page.
  const cfg = (typeof window !== "undefined"
    ? (window as any).SCC_WAYFINDER_CONFIG
    : null) ?? {};
  const geojsonUrl =
    cfg.geojsonUrl ||
    new URL("./maps/site.geojson", import.meta.url).toString();
  const level1Url =
    cfg.level1Url ||
    new URL("./maps/level-1.svg", import.meta.url).toString();
  const topClusterUrl =
    cfg.topClusterUrl ||
    new URL("./maps/level-1-cluster-top.svg", import.meta.url).toString();
  const midClusterUrl =
    cfg.midClusterUrl ||
    new URL("./maps/level-1-cluster-mid.svg", import.meta.url).toString();
  const rightClusterUrl =
    cfg.rightClusterUrl ||
    new URL("./maps/level-1-cluster-right.svg", import.meta.url).toString();
  // Backdrop fit knobs — the hand-drawn floor plan is at a slightly
  // different scale from the surveyed polygons, so the operator can
  // dial in until the building outlines line up. Scale anchors at
  // the viewBox centre (600, 400) so the building doesn't drift.
  // Values live in state so the tuner panel (?tune=1) can update
  // them live without a page reload; initial values come from
  // SCC_WAYFINDER_CONFIG.
  // Defaults dialled in by the operator on 2026-05-26 via the live
  // tuner. Re-dial with ?tune=1 if a future asset re-extraction
  // moves the artwork.
  const [backdropScale, setBackdropScale] = useState<number>(
    typeof cfg.backdropScale === "number" ? cfg.backdropScale : 0.95,
  );
  const [backdropOffsetX, setBackdropOffsetX] = useState<number>(
    typeof cfg.backdropOffsetX === "number" ? cfg.backdropOffsetX : 63,
  );
  const [backdropOffsetY, setBackdropOffsetY] = useState<number>(
    typeof cfg.backdropOffsetY === "number" ? cfg.backdropOffsetY : 25,
  );
  const [backdropRotation, setBackdropRotation] = useState<number>(
    typeof cfg.backdropRotation === "number" ? cfg.backdropRotation : 0,
  );
  // Per-cluster translate offsets. Independent of the base backdrop.
  const [topOffsetX, setTopOffsetX] = useState<number>(
    typeof cfg.topOffsetX === "number" ? cfg.topOffsetX : -3,
  );
  const [topOffsetY, setTopOffsetY] = useState<number>(
    typeof cfg.topOffsetY === "number" ? cfg.topOffsetY : 36,
  );
  const [midOffsetX, setMidOffsetX] = useState<number>(
    typeof cfg.midOffsetX === "number" ? cfg.midOffsetX : 0,
  );
  const [midOffsetY, setMidOffsetY] = useState<number>(
    typeof cfg.midOffsetY === "number" ? cfg.midOffsetY : 0,
  );
  const [rightOffsetX, setRightOffsetX] = useState<number>(
    typeof cfg.rightOffsetX === "number" ? cfg.rightOffsetX : -5,
  );
  const [rightOffsetY, setRightOffsetY] = useState<number>(
    typeof cfg.rightOffsetY === "number" ? cfg.rightOffsetY : 54.64,
  );
  const backdropX = (1 - backdropScale) * 600 + backdropOffsetX;
  const backdropY = (1 - backdropScale) * 400 + backdropOffsetY;
  const backdropW = 1200 * backdropScale;
  const backdropH = 800 * backdropScale;
  const backdropTransform = `rotate(${backdropRotation} 600 400)`;

  // Reusable pointer-drag factory: returns an onPointerDown handler
  // that, while held, calls the given setters with viewBox-scaled
  // pointer deltas. Used by the base backdrop and each cluster.
  function makeDragHandler(
    getOffsetX: () => number,
    getOffsetY: () => number,
    setX: (v: number) => void,
    setY: (v: number) => void,
  ) {
    return (e: PointerEvent) => {
      if (!showTuner) return;
      e.stopPropagation();
      const img = e.currentTarget as SVGImageElement;
      img.setPointerCapture(e.pointerId);
      const startX = e.clientX, startY = e.clientY;
      const origX = getOffsetX(), origY = getOffsetY();
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const sx = vw / rect.width, sy = vh / rect.height;
      const onMove = (ev: PointerEvent) => {
        setX(origX + (ev.clientX - startX) * sx);
        setY(origY + (ev.clientY - startY) * sy);
      };
      const onUp = (ev: PointerEvent) => {
        img.releasePointerCapture(ev.pointerId);
        img.removeEventListener("pointermove", onMove);
        img.removeEventListener("pointerup", onUp);
        img.removeEventListener("pointercancel", onUp);
      };
      img.addEventListener("pointermove", onMove);
      img.addEventListener("pointerup", onUp);
      img.addEventListener("pointercancel", onUp);
    };
  }
  // Show the live tuner panel only when ?tune=1 is in the URL — we
  // don't want regular visitors to see development controls.
  const showTuner = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("tune") === "1";

  useEffect(() => {
    let cancelled = false;
    fetch(geojsonUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`site.geojson ${r.status}`))))
      .then((data: SiteFeatureCollection) => { if (!cancelled) setCollection(data); })
      .catch((err) => console.error("[scc-wayfinder] failed to load site.geojson from", geojsonUrl, err));
    return () => { cancelled = true; };
  }, [geojsonUrl]);

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
  const [editGraph, setEditGraphRaw] = useState<EditGraph>(
    () => loadInitialEditGraph(),
  );
  const [tool, setTool] = useState<ToolMode>("pen");
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [stroke, setStroke] = useState<Array<[number, number]>>([]);
  // Hides the editable nodes+edges overlay so the operator can see
  // the live route on a clean background while correcting the path.
  const [showEditLayer, setShowEditLayer] = useState(true);

  // First click of the line tool sets the pending start point. Second
  // click commits a straight edge and clears it. Stored in viewBox
  // coords so it works regardless of pan/zoom.
  const [lineStart, setLineStart] = useState<[number, number] | null>(null);
  const [cursorPt, setCursorPt] = useState<[number, number] | null>(null);

  // Undo history. Each `mutate(fn)` pushes the previous editGraph
  // snapshot before applying the update. Capped at HISTORY_LIMIT so
  // memory doesn't grow unbounded during long tracing sessions.
  const historyRef = useRef<Array<EditGraph>>([]);
  const [canUndo, setCanUndo] = useState(false);
  const mutate = useCallback(
    (fn: (g: EditGraph) => EditGraph) => {
      setEditGraphRaw((g) => {
        historyRef.current.push(g);
        if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
        setCanUndo(true);
        return fn(g);
      });
    },
    [],
  );
  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setEditGraphRaw(prev);
    setCanUndo(historyRef.current.length > 0);
    setSelectedEditId(null);
    setLineStart(null);
  }, []);

  // For mutations that don't go through `mutate` (load-from-disk
  // replacements where pushing then setting would still be 2 ops).
  const replaceGraph = useCallback(
    (next: EditGraph) => {
      setEditGraphRaw((g) => {
        historyRef.current.push(g);
        if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
        setCanUndo(true);
        return next;
      });
    },
    [],
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Persist edits so a refresh doesn't blow away a tracing session.
  useEffect(() => {
    if (!editMode) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(editGraph)); } catch {}
  }, [editGraph, editMode]);

  // Reset transient line/cursor state when tool changes or edit mode toggles.
  useEffect(() => {
    setLineStart(null);
    setCursorPt(null);
  }, [tool, editMode]);

  // Escape cancels an in-progress line.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setLineStart(null);
      setCursorPt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  // Backspace / Delete with a selected node removes it + adjacent edges.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!selectedEditId) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      e.preventDefault();
      mutate((g) => ({
        ...g,
        nodes: g.nodes.filter((n) => n.id !== selectedEditId),
        edges: g.edges.filter((e2) => e2.a !== selectedEditId && e2.b !== selectedEditId),
      }));
      setSelectedEditId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, selectedEditId, mutate]);

  // Ctrl/Cmd+Z → undo. Skipped while focus is in a form field so the
  // browser's native undo still works inside text inputs.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === "z" || e.key === "Z")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, undo]);

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
      // One history snapshot per drag (not per move tick).
      historyRef.current.push(editGraph);
      if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
      setCanUndo(true);
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
    // Track cursor while the line tool is active so we can render
    // the rubber-band preview from `lineStart` → cursor.
    if (editMode && (tool === "line" || tool === "barrier") && lineStart) {
      const sp = svgPoint(e.clientX, e.clientY);
      setCursorPt([sp.x, sp.y]);
    }
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
      // Bypass history here — history was snapshotted at drag-start.
      setEditGraphRaw((g) => ({
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

    // Line tool: clicks set start, then commit a straight edge.
    // Clicks on an existing edit-node snap to its coords; clicks on
    // empty space use the cursor's viewBox position. The second
    // click of a chain commits and immediately becomes the start of
    // the next segment, so chained line-drawing feels continuous.
    if (wasClick && tool === "line" && !onUnit && !onKiosk) {
      const p: [number, number] = onEditNode
        ? (() => {
            const id = (onEditNode as HTMLElement).dataset.editNodeId!;
            const n = editGraph.nodes.find((nn) => nn.id === id)!;
            return [n.x, n.y] as [number, number];
          })()
        : (() => { const sp = svgPoint(e.clientX, e.clientY); return [sp.x, sp.y]; })();
      if (!lineStart) {
        setLineStart(p);
      } else {
        commitLine(lineStart, p);
        setLineStart(p);
      }
      return;
    }

    // Barrier tool: same click-click pattern as line, but commits a
    // barrier segment (not an edge). Wayfinder routes can't cross
    // barriers — `buildGraph` drops any edge that intersects one.
    if (wasClick && tool === "barrier" && !onUnit && !onKiosk) {
      const sp = svgPoint(e.clientX, e.clientY);
      const p: [number, number] = [sp.x, sp.y];
      if (!lineStart) {
        setLineStart(p);
      } else {
        commitBarrier(lineStart, p);
        setLineStart(p);
      }
      return;
    }

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
    if (wasClick && d.type === "pan" && !onUnit && !onKiosk && tool !== "pen" && tool !== "line" && tool !== "barrier") {
      const { x, y } = svgPoint(e.clientX, e.clientY);
      addNodeAt(x, y, tool as EditNodeType);
    }
  };

  const commitStroke = (raw: Array<[number, number]>) => {
    const pts = downsample(raw, PEN_DOWNSAMPLE);
    if (pts.length < 2) return;
    mutate((g) => {
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
      return { ...g, nodes: newNodes, edges: newEdges };
    });
  };

  const toggleEdge = (a: string, b: string) => {
    mutate((g) => {
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
    mutate((g) => ({ ...g, nodes: [...g.nodes, node] }));
    setSelectedEditId(id);
  };

  /** Commit a straight line between two viewBox-space points using
   *  `addStraightLine` from the editor lib. `step` subdivides the
   *  segment into intermediate junctions ~PEN_DOWNSAMPLE px apart so
   *  a line drawn with the line tool produces the same node density
   *  as the pen tool — routing has snap points along the path. */
  const commitLine = (pa: [number, number], pb: [number, number]) => {
    mutate((g) => addStraightLine(g, pa, pb, {
      snapRadius: SNAP_RADIUS, newId, step: PEN_DOWNSAMPLE,
    }));
  };

  const commitBarrier = (pa: [number, number], pb: [number, number]) => {
    mutate((g) => addBarrier(g, pa, pb, { newId }) as EditGraph);
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
    replaceGraph(loadInitialEditGraph(true));
    setSelectedEditId(null);
  };

  const clearAll = () => {
    if (!confirm("Wipe ALL junctions, kiosks, entrances and their edges? (Store nodes are kept.)")) return;
    replaceGraph({ nodes: [], edges: [], barriers: [] });
    setSelectedEditId(null);
  };

  /** Load JSON button handler. Opens a file picker; the chosen file
   *  is validated with `parseGraphJson`. On success we extract the
   *  editor-tracked node types (junction/kiosk/entrance-*) and edges
   *  between them — store-centroid nodes are derived at save time so
   *  they're stripped on import. The replacement is pushed through
   *  `replaceGraph` so a misclick is undoable. */
  const onLoadJsonClicked = () => fileInputRef.current?.click();
  const onLoadJsonFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-selecting the same file
    if (!file) return;
    const text = await file.text();
    const parsed = parseGraphJson(text);
    if (!parsed.ok) {
      alert(`Couldn't load that file:\n\n${parsed.error}`);
      return;
    }
    const editable: EditNode[] = parsed.graph.nodes
      .filter((n: any) => n.type === "junction" || n.type === "kiosk" || n.type === "entrance-main" || n.type === "entrance-tenant" || n.type === "amenity-washroom" || n.type === "amenity-security")
      .map((n: any) => ({ id: n.id, x: n.x, y: n.y, type: n.type, label: n.label }));
    const ids = new Set(editable.map((n) => n.id));
    const edges: EditEdge[] = parsed.graph.edges
      .filter((e: any) => ids.has(e.a) && ids.has(e.b))
      .map((e: any) => ({ a: e.a, b: e.b, cost: e.cost ?? Math.round(Math.hypot(
        (editable.find((n) => n.id === e.a)!.x - editable.find((n) => n.id === e.b)!.x),
        (editable.find((n) => n.id === e.a)!.y - editable.find((n) => n.id === e.b)!.y),
      )) }));
    const barriers: EditBarrier[] = ((parsed.graph as any).barriers ?? [])
      .filter((b: any) => b && typeof b.id === "string" && Array.isArray(b.a) && Array.isArray(b.b))
      .map((b: any) => ({ id: b.id, a: [b.a[0], b.a[1]], b: [b.b[0], b.b[1]] }));
    replaceGraph({ nodes: editable, edges, barriers });
    setSelectedEditId(null);
    setLineStart(null);
  };

  // --- render -----------------------------------------------------
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Kiosks (main entrances) render as informational markers.
  const kiosks = (graphData.nodes as Array<GraphNode>).filter((n) => n.type === "kiosk");

  // Tenant-to-tenant route. We always route against the on-disk
  // graph (which is autoconnected + fully connected) — including in
  // edit mode. The operator wants to see the route visitors actually
  // see so they can find the wrong segment and fix it; the live
  // edit graph is partial until autoconnect is re-run on save.
  const builtGraph = useMemo(() => {
    const polygons = (collection?.features ?? [])
      .filter((f) => f.geometry?.type === "Polygon")
      .map((f) => ({
        store_id: f.properties.store_id,
        ring: f.geometry.coordinates[0],
      }));
    return buildGraph({ ...(graphData as any), polygons });
  }, [collection]);
  const routePath = useMemo(() => {
    if (!fromStore?.id || !toStore?.id || fromStore.id === toStore.id) return null;
    // Trims store-centroid endpoints — polyline terminates at each
    // store's entrance-tenant, never inside the unit's polygon.
    return routeBetweenStores(builtGraph, fromStore.id, toStore.id);
  }, [builtGraph, fromStore?.id, toStore?.id]);
  const routePoints = routePath?.points
    ? routePath.points.map(([x, y]: [number, number]) => `${x},${y}`).join(" ")
    : null;


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
          {/* Site backdrop: full level-1.svg with all parking-lot
              vectors, street labels, building shell, and decorations
              from the original southcommoncentre.ca/wff layout.
              Tenant cells stripped at vendor time so they don't
              double up with the route polygons. Operator can drag
              the image around in tuner mode (?tune=1) to align it
              with the same items in our surveyed polygons. */}
          <image
            href={level1Url}
            x={backdropX}
            y={backdropY}
            width={backdropW}
            height={backdropH}
            transform={backdropTransform}
            preserveAspectRatio="xMidYMid meet"
            style={{
              pointerEvents: showTuner ? "auto" : "none",
              cursor: showTuner ? "move" : "auto",
            }}
            onPointerDown={showTuner ? makeDragHandler(
              () => backdropOffsetX, () => backdropOffsetY,
              setBackdropOffsetX, setBackdropOffsetY,
            ) : undefined}
          />
          {/* Top cluster (NW parking stripes near Fit4Less) —
              draggable separately from the base backdrop. */}
          <image
            href={topClusterUrl}
            x={0} y={0} width={1200} height={800}
            transform={`translate(${topOffsetX} ${topOffsetY})`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              pointerEvents: showTuner ? "auto" : "none",
              cursor: showTuner ? "move" : "auto",
            }}
            onPointerDown={showTuner ? makeDragHandler(
              () => topOffsetX, () => topOffsetY,
              setTopOffsetX, setTopOffsetY,
            ) : undefined}
          />
          {/* Top-middle cluster (signage at the north entrance) — its
              own draggable layer so the operator can nudge it into
              place without moving the rest of the backdrop. */}
          <image
            href={midClusterUrl}
            x={0} y={0} width={1200} height={800}
            transform={`translate(${midOffsetX} ${midOffsetY})`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              pointerEvents: showTuner ? "auto" : "none",
              cursor: showTuner ? "move" : "auto",
            }}
            onPointerDown={showTuner ? makeDragHandler(
              () => midOffsetX, () => midOffsetY,
              setMidOffsetX, setMidOffsetY,
            ) : undefined}
          />
          {/* Top-right cluster (NE parking stripes + road label) —
              same drag pattern. */}
          <image
            href={rightClusterUrl}
            x={0} y={0} width={1200} height={800}
            transform={`translate(${rightOffsetX} ${rightOffsetY})`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              pointerEvents: showTuner ? "auto" : "none",
              cursor: showTuner ? "move" : "auto",
            }}
            onPointerDown={showTuner ? makeDragHandler(
              () => rightOffsetX, () => rightOffsetY,
              setRightOffsetX, setRightOffsetY,
            ) : undefined}
          />
          <rect class="scc-wf__lot" x={vx0} y={vy0} width={VW} height={VH} fill="url(#scc-drive)" opacity={0} />
          <rect class="scc-wf__lot-stalls" x={vx0} y={vy0} width={VW} height={VH} fill="url(#scc-parking)" opacity={0} />

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
                onClick={() => store && onSelectStore?.(store)}
              >
                <title>{p.name} · #{p.unit}</title>
              </path>
            );
          })}

          {editMode && showEditLayer && (
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
              {/* live line-tool rubber-band preview */}
              {tool === "line" && lineStart && cursorPt && (
                <line class="scc-wf__edit-line-preview"
                      x1={lineStart[0]} y1={lineStart[1]}
                      x2={cursorPt[0]}  y2={cursorPt[1]} />
              )}
              {/* line-tool start marker */}
              {tool === "line" && lineStart && (
                <circle class="scc-wf__edit-line-anchor"
                        cx={lineStart[0]} cy={lineStart[1]} r={6} />
              )}
              {/* saved barrier segments — routes can't cross these */}
              {editGraph.barriers.map((bar) => (
                <line key={`bar-${bar.id}`} class="scc-wf__edit-barrier"
                      x1={bar.a[0]} y1={bar.a[1]} x2={bar.b[0]} y2={bar.b[1]} />
              ))}
              {/* live barrier rubber-band preview */}
              {tool === "barrier" && lineStart && cursorPt && (
                <line class="scc-wf__edit-barrier-preview"
                      x1={lineStart[0]} y1={lineStart[1]}
                      x2={cursorPt[0]}  y2={cursorPt[1]} />
              )}
              {tool === "barrier" && lineStart && (
                <circle class="scc-wf__edit-barrier-anchor"
                        cx={lineStart[0]} cy={lineStart[1]} r={6} />
              )}
              {editGraph.nodes.map((n) => {
                const isSel = selectedEditId === n.id;
                const r = editNodeRadius(n.type);
                return (
                  <g
                    key={n.id}
                    class={`scc-wf__edit-node scc-wf__edit-node--${n.type}` + (isSel ? " is-selected" : "")}
                    data-edit-node-id={n.id}
                  >
                    <circle cx={n.x} cy={n.y} r={r} />
                    {(n.type === "kiosk" || n.type === "entrance-main") && (
                      <text x={n.x} y={n.y + r + 18} textAnchor="middle"
                            transform={`rotate(${LABEL_COUNTER_ROTATION} ${n.x} ${n.y + r + 18})`}>
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
                    x={lx} y={ly + 4} textAnchor="middle"
                    transform={`rotate(${LABEL_COUNTER_ROTATION} ${lx} ${ly + 4})`}>
                {f.properties.name}
              </text>
            );
          })}

          {!editMode && kiosks.map((n) => {
            const label = n.label ?? n.id.replace(/^kiosk-/, "Kiosk ").toUpperCase();
            return (
              <g key={n.id} class="scc-wf__kiosk" data-kiosk-id={n.id}>
                <circle cx={n.x} cy={n.y} r={14} />
                <text x={n.x} y={n.y + 32} textAnchor="middle"
                      transform={`rotate(${LABEL_COUNTER_ROTATION} ${n.x} ${n.y + 32})`}>{label}</text>
              </g>
            );
          })}

          {/* Amenity markers (washrooms, security). Live alongside
              tenant polygons but render from graph nodes rather than
              geojson features — they're points on the floor plan,
              not retail units with floor area. */}
          {!editMode && (graphData.nodes as Array<GraphNode>)
            .filter((n) => n.type === "amenity-washroom" || n.type === "amenity-security")
            .map((n) => {
              const isWashroom = n.type === "amenity-washroom";
              const glyph = isWashroom ? "🚻" : "🛡";
              const label = isWashroom ? "Washroom" : "Security";
              return (
                <g key={n.id} class={`scc-wf__amenity scc-wf__amenity--${isWashroom ? "washroom" : "security"}`} data-amenity-id={n.id}>
                  <circle cx={n.x} cy={n.y} r={12} />
                  <text x={n.x} y={n.y + 5} textAnchor="middle" class="scc-wf__amenity-glyph"
                        transform={`rotate(${LABEL_COUNTER_ROTATION} ${n.x} ${n.y + 5})`}>{glyph}</text>
                  <text x={n.x} y={n.y + 28} textAnchor="middle" class="scc-wf__amenity-label"
                        transform={`rotate(${LABEL_COUNTER_ROTATION} ${n.x} ${n.y + 28})`}>{label}</text>
                </g>
              );
            })}

          {/* Tenant→tenant route polyline. Renders the A* path's
              node points directly — no straight-line shortcuts;
              every segment is a graph edge. In edit mode the route
              is built from the LIVE edited graph so corrections show
              up immediately. Null when origin and destination are in
              different components. */}
          {routePoints && (
            <polyline
              key={`route-${fromStore?.id}-${toStore?.id}`}
              class="scc-wf__route"
              points={routePoints}
              fill="none"
            />
          )}
          {fromStore && (() => {
            // The "you are here" pulse anchors to the origin's node
            // in the on-disk graph (same graph the route is computed
            // against, so they stay co-located).
            const node = (graphData.nodes as Array<GraphNode>).find(
              (n) => n.id === fromStore.id,
            );
            if (!node) return null;
            return (
              <g class="scc-wf__here" data-store-id={fromStore.id}>
                <circle cx={node.x} cy={node.y} r={10} class="scc-wf__here-ring" />
                <circle cx={node.x} cy={node.y} r={5} class="scc-wf__here-dot" />
              </g>
            );
          })()}
        </g>
      </svg>

      <div class="scc-wf__zoom">
        <button onClick={() => setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM))} aria-label="Zoom in">+</button>
        <button onClick={() => setZoom((z) => clamp(z / 1.2, MIN_ZOOM, MAX_ZOOM))} aria-label="Zoom out">−</button>
        <button onClick={reset} aria-label="Reset view">⟲</button>
      </div>

      {showTuner && (
        <div class="scc-wf__tuner" role="region" aria-label="Backdrop tuner">
          <div class="scc-wf__tuner-title">Backdrop tuner</div>
          <label class="scc-wf__tuner-row">
            <span>Scale</span>
            <input type="number" step="0.01" value={backdropScale}
                   onChange={(e) => setBackdropScale(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="scc-wf__tuner-row">
            <span>Offset X</span>
            <input type="number" step="1" value={backdropOffsetX}
                   onChange={(e) => setBackdropOffsetX(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="scc-wf__tuner-row">
            <span>Offset Y</span>
            <input type="number" step="1" value={backdropOffsetY}
                   onChange={(e) => setBackdropOffsetY(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <div class="scc-wf__tuner-row">
            <span>Rotate</span>
            <div class="scc-wf__tuner-rot">
              <button type="button" onClick={() => setBackdropRotation((r) => r - 1)} aria-label="Rotate CCW 1 degree">↺ −1°</button>
              <span class="scc-wf__tuner-rot-val">{backdropRotation.toFixed(0)}°</span>
              <button type="button" onClick={() => setBackdropRotation((r) => r + 1)} aria-label="Rotate CW 1 degree">↻ +1°</button>
            </div>
          </div>
          <label class="scc-wf__tuner-row">
            <span>Top X</span>
            <input type="number" step="1" value={topOffsetX}
                   onChange={(e) => setTopOffsetX(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="scc-wf__tuner-row">
            <span>Top Y</span>
            <input type="number" step="1" value={topOffsetY}
                   onChange={(e) => setTopOffsetY(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="scc-wf__tuner-row">
            <span>Mid X</span>
            <input type="number" step="1" value={midOffsetX}
                   onChange={(e) => setMidOffsetX(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="scc-wf__tuner-row">
            <span>Mid Y</span>
            <input type="number" step="1" value={midOffsetY}
                   onChange={(e) => setMidOffsetY(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="scc-wf__tuner-row">
            <span>Right X</span>
            <input type="number" step="1" value={rightOffsetX}
                   onChange={(e) => setRightOffsetX(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="scc-wf__tuner-row">
            <span>Right Y</span>
            <input type="number" step="1" value={rightOffsetY}
                   onChange={(e) => setRightOffsetY(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <div class="scc-wf__tuner-hint">
            scale {backdropScale.toFixed(2)} · X {backdropOffsetX} · Y {backdropOffsetY} · rot {backdropRotation}°
            <br />top ({Math.round(topOffsetX)},{Math.round(topOffsetY)}) · mid ({Math.round(midOffsetX)},{Math.round(midOffsetY)}) · right ({Math.round(rightOffsetX)},{Math.round(rightOffsetY)})
          </div>
        </div>
      )}

      {editMode && (
        <div class="scc-wf__editor">
          <div class="scc-wf__editor-title">Path editor</div>
          <div class="scc-wf__editor-row scc-wf__editor-tools">
            {([
              { id: "pen",              label: "✎ Pen (stroke)" },
              { id: "line",             label: "／ Line (straight)" },
              { id: "barrier",          label: "✕ Barrier (no-cross)" },
              { id: "junction",         label: "○ Junction" },
              { id: "kiosk",            label: "● Kiosk" },
              { id: "entrance-main",    label: "▲ Main entrance" },
              { id: "entrance-tenant",  label: "◆ Tenant entrance" },
              { id: "amenity-washroom", label: "🚻 Washroom" },
              { id: "amenity-security", label: "🛡 Security" },
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
              : tool === "line"
              ? "Click to set the start point, click again to drop a straight edge. Endpoints near existing nodes snap to them. Each subsequent click chains another segment. Esc cancels."
              : tool === "barrier"
              ? "Click to set the start point, click again to drop a barrier segment. Any walking edge crossing this line is removed at build time, forcing a detour. Chained clicks continue the wall. Esc cancels."
              : `Click empty space to drop a ${tool.replace("entrance-", "").replace("-", " ")}. Click a node to select it; click another node to toggle an edge. Drag to move; Backspace to delete.`}
          </p>
          <div class="scc-wf__editor-stats">
            {editGraph.nodes.length} node{editGraph.nodes.length === 1 ? "" : "s"} ·{" "}
            {editGraph.edges.length} edge{editGraph.edges.length === 1 ? "" : "s"} ·{" "}
            {editGraph.barriers.length} barrier{editGraph.barriers.length === 1 ? "" : "s"}
            {selectedEditId && <> · sel <code>{selectedEditId.slice(0, 10)}</code></>}
          </div>
          <div class="scc-wf__editor-actions">
            <button onClick={downloadGraph} class="scc-wf__cta">Save graph.json</button>
            <button onClick={onLoadJsonClicked} class="scc-wf__cta scc-wf__cta--ghost">Load…</button>
            <button
              onClick={() => setShowEditLayer((v) => !v)}
              class="scc-wf__cta scc-wf__cta--ghost"
              title="Toggle the editable nodes/edges overlay so the live route stands out"
            >
              {showEditLayer ? "Hide graph" : "Show graph"}
            </button>
            <button
              onClick={undo}
              disabled={!canUndo}
              class="scc-wf__cta scc-wf__cta--ghost"
              title="Undo last edit (Ctrl/⌘+Z)"
            >
              ↶ Undo
            </button>
            <button onClick={clearAll} class="scc-wf__cta scc-wf__cta--ghost">Clear</button>
            <button onClick={resetGraph} class="scc-wf__cta scc-wf__cta--ghost">Reset</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style="display:none"
              onChange={onLoadJsonFile}
            />
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

function loadInitialEditGraph(forceDisk = false): EditGraph {
  if (!forceDisk && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.nodes && parsed?.edges) {
          return { ...parsed, barriers: parsed.barriers ?? [] };
        }
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
  const barriers: EditBarrier[] = ((graphData as any).barriers ?? []) as EditBarrier[];
  return { nodes: editable, edges, barriers };
}

function composeGraph(edit: EditGraph) {
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
    barriers: edit.barriers,
  };
}
