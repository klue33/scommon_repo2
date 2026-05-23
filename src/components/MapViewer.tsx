import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import graphData from "@/data/graph.json";
import { buildGraph, route, type GraphNode } from "../lib/pathfind";
import { storeById, type Store, VIEW_BOX } from "../lib/stores";

interface Props {
  selectedStore?: Store | null;
  routeFrom?: string;
  onSelectStore?: (s: Store) => void;
  onSelectKiosk?: (id: string) => void;
}

interface SiteFeature {
  type: "Feature";
  properties: {
    store_id: string;
    unit: string;
    name: string;
    category: string;
    vacant: boolean;
    centroid: [number, number];
  };
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

interface SiteFeatureCollection {
  type: "FeatureCollection";
  features: SiteFeature[];
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;

export function MapViewer({ selectedStore, routeFrom, onSelectStore, onSelectKiosk }: Props) {
  const graph = useMemo(() => buildGraph(graphData as any), []);
  const [collection, setCollection] = useState<SiteFeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(new URL("/maps/site.geojson", document.baseURI).toString())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`site.geojson ${r.status}`))))
      .then((data: SiteFeatureCollection) => { if (!cancelled) setCollection(data); })
      .catch((err) => console.error("[scc-wayfinder] failed to load site.geojson", err));
    return () => { cancelled = true; };
  }, []);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; pid: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const routePoints = useMemo(() => {
    if (!selectedStore || !routeFrom) return null;
    const goalNode = findNodeForStore(graph, selectedStore.id);
    if (!goalNode || !graph.nodes.has(routeFrom)) return null;
    const r = route(graph, routeFrom, goalNode.id);
    return r?.points ?? null;
  }, [graph, routeFrom, selectedStore]);

  const [vx0, vy0, VW, VH] = VIEW_BOX;
  const vw = VW / zoom;
  const vh = VH / zoom;
  const vx = vx0 + pan.x;
  const vy = vy0 + pan.y;
  const viewBox = `${vx} ${vy} ${vw} ${vh}`;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
  };

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element;
    if (target.closest("[data-store-id], [data-kiosk-id]")) return;
    dragRef.current = { x: e.clientX, y: e.clientY, pid: e.pointerId };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const scaleX = (VW / zoom) / rect.width;
    const scaleY = (VH / zoom) / rect.height;
    const dx = (e.clientX - dragRef.current.x) * scaleX;
    const dy = (e.clientY - dragRef.current.y) * scaleY;
    setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (dragRef.current?.pid === e.pointerId) {
      svgRef.current?.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const nodes = [...graph.nodes.values()];
  const kiosks = nodes.filter((n) => n.type === "kiosk");
  const origin = routeFrom ? graph.nodes.get(routeFrom) : null;

  return (
    <div class="scc-wf__viewer">
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
        {/* unit polygons (the real buildings) */}
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
              key={p.store_id}
              class={classes}
              d={d}
              data-store-id={p.store_id}
              onClick={() => store && onSelectStore?.(store)}
            >
              <title>{p.name} · #{p.unit}</title>
            </path>
          );
        })}

        {/* sidewalk graph edges — drawn faintly behind labels */}
        {graphData.edges.map((e, i) => {
          const a = graph.nodes.get(e.a);
          const b = graph.nodes.get(e.b);
          if (!a || !b) return null;
          return (
            <line
              key={`edge-${i}`}
              class="scc-wf__edge"
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            />
          );
        })}

        {/* selected-store label (rendered above its polygon) */}
        {collection?.features.map((f) => {
          if (selectedStore?.id !== f.properties.store_id) return null;
          const [cx, cy] = f.properties.centroid;
          return (
            <text
              key={`lbl-${f.properties.store_id}`}
              class="scc-wf__label"
              x={cx} y={cy + 4} textAnchor="middle"
            >
              {f.properties.name}
            </text>
          );
        })}

        {/* kiosk pins */}
        {kiosks.map((n) => {
          const isActive = routeFrom === n.id;
          const label = n.label ?? n.id.replace(/^kiosk-/, "Kiosk ").toUpperCase();
          return (
            <g
              key={n.id}
              class={"scc-wf__kiosk" + (isActive ? " is-active" : "")}
              data-kiosk-id={n.id}
              onClick={() => onSelectKiosk?.(n.id)}
              role={onSelectKiosk ? "button" : undefined}
              tabindex={onSelectKiosk ? 0 : undefined}
            >
              <circle cx={n.x} cy={n.y} r={14} />
              <text x={n.x} y={n.y + 32} textAnchor="middle">{label}</text>
            </g>
          );
        })}

        {/* "you are here" pulse on the routing origin */}
        {origin && (
          <g class="scc-wf__origin">
            <circle class="scc-wf__origin-halo" cx={origin.x} cy={origin.y} r={26} />
            <circle class="scc-wf__origin-dot" cx={origin.x} cy={origin.y} r={9} />
          </g>
        )}

        {/* live route polyline */}
        {routePoints && (
          <polyline
            class="scc-wf__route"
            points={routePoints.map(([x, y]) => `${x},${y}`).join(" ")}
          />
        )}
      </svg>

      <div class="scc-wf__zoom">
        <button onClick={() => setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM))} aria-label="Zoom in">+</button>
        <button onClick={() => setZoom((z) => clamp(z / 1.2, MIN_ZOOM, MAX_ZOOM))} aria-label="Zoom out">−</button>
        <button onClick={reset} aria-label="Reset view">⟲</button>
      </div>
    </div>
  );
}

function polygonToPath(rings: number[][][]): string {
  return rings.map((ring) => {
    const cmds = ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`);
    return cmds.join(" ") + " Z";
  }).join(" ");
}

function findNodeForStore(
  graph: ReturnType<typeof buildGraph>,
  storeId: string,
): GraphNode | undefined {
  for (const n of graph.nodes.values()) {
    if (n.store === storeId) return n;
  }
  return undefined;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
