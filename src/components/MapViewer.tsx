import { useMemo, useRef, useState } from "preact/hooks";
import graphData from "@/data/graph.json";
import { buildGraph, route, type GraphNode } from "../lib/pathfind";
import { storeById, type Store } from "../lib/stores";

interface Props {
  selectedStore?: Store | null;
  routeFrom?: string;          // node id (typically a kiosk)
  onSelectStore?: (s: Store) => void;
}

// Base viewBox of the synthetic site plan. Matches the coordinate
// space of data/graph.json — when the real public/maps/site.svg
// arrives this will switch to its viewBox.
const VIEW = { x: -40, y: 60, w: 1020, h: 360 };
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

export function MapViewer({ selectedStore, routeFrom, onSelectStore }: Props) {
  const graph = useMemo(() => buildGraph(graphData as any), []);

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

  const vw = VIEW.w / zoom;
  const vh = VIEW.h / zoom;
  const vx = VIEW.x + pan.x;
  const vy = VIEW.y + pan.y;
  const viewBox = `${vx} ${vy} ${vw} ${vh}`;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
  };

  const onPointerDown = (e: PointerEvent) => {
    // Only start a pan on background drag; let store clicks bubble.
    const target = e.target as Element;
    if (target.closest("[data-store-id]")) return;
    dragRef.current = { x: e.clientX, y: e.clientY, pid: e.pointerId };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    // Scale screen-pixel delta into viewBox units.
    const scaleX = (VIEW.w / zoom) / rect.width;
    const scaleY = (VIEW.h / zoom) / rect.height;
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
  const stores = nodes.filter((n) => n.type === "store");
  const junctions = nodes.filter((n) => n.type === "junction");
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
        {/* sidewalks */}
        {graphData.edges.map((e, i) => {
          const a = graph.nodes.get(e.a)!;
          const b = graph.nodes.get(e.b)!;
          return (
            <line
              key={`edge-${i}`}
              class="scc-wf__edge"
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            />
          );
        })}

        {/* junctions (small dots so the network is visible during dev) */}
        {junctions.map((n) => (
          <circle key={n.id} class="scc-wf__junction" cx={n.x} cy={n.y} r={2.5} />
        ))}

        {/* store cells */}
        {stores.map((n) => {
          const store = storeById(n.store!);
          if (!store) return null;
          const isSelected = selectedStore?.id === store.id;
          return (
            <g
              key={n.id}
              class={"scc-wf__store" + (isSelected ? " is-selected" : "")}
              data-store-id={store.id}
              onClick={() => onSelectStore?.(store)}
            >
              <rect x={n.x - 42} y={n.y - 18} width={84} height={36} rx={3} />
              <text x={n.x} y={n.y + 4} textAnchor="middle">{store.name}</text>
            </g>
          );
        })}

        {/* kiosk pins */}
        {kiosks.map((n) => (
          <g key={n.id} class="scc-wf__kiosk" data-kiosk-id={n.id}>
            <circle cx={n.x} cy={n.y} r={9} />
            <text x={n.x} y={n.y + 24} textAnchor="middle">KIOSK</text>
          </g>
        ))}

        {/* "you are here" pulse on the routing origin */}
        {origin && (
          <g class="scc-wf__origin">
            <circle class="scc-wf__origin-halo" cx={origin.x} cy={origin.y} r={18} />
            <circle class="scc-wf__origin-dot" cx={origin.x} cy={origin.y} r={6} />
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
