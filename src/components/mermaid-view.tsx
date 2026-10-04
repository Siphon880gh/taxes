"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

type Marker = {
  key: string;
  tipId: string;
  nodeId?: string;
  label: string;
  x: number;
  y: number;
};

type Props = {
  source: string;
  nodeIds: string[];
  nodeTips: { id: string; tipId: string; label: string }[];
  edgeTips: { from: string; to: string; tipId: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTip: (tipId: string, nodeId?: string) => void;
  levelNodes: { id: string; title: string }[];
  levelExpanded: boolean;
  onToggleLevel: () => void;
};

let renderSeq = 0;
let mermaidReady = false;

function matchNodeId(elementId: string, known: Set<string>): string | null {
  if (known.has(elementId)) return elementId;
  const prefixed = elementId.match(/(?:flowchart|agentflow)-(.+)-\d+$/);
  if (prefixed && known.has(prefixed[1])) return prefixed[1];
  return null;
}

const lensZooms = [1, 1.5, 2, 3, 4, 6];

function zoomThatFitsWidth(naturalWidth: number, available: number): number | null {
  if (!available || !naturalWidth) return null;
  // A short chart already fits. Leave it at 100% instead of stretching a few nodes.
  if (naturalWidth <= available - 24) return 1;
  return Math.max(0.05, Math.floor(((available - 24) / naturalWidth) * 1000) / 1000);
}

function distToRect(x: number, y: number, rect: DOMRect): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

export function MermaidView({ source, nodeIds, nodeTips, edgeTips, selectedId, onSelect, onTip, levelNodes, levelExpanded, onToggleLevel }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const onSelectRef = useRef(onSelect);
  const onTipRef = useRef(onTip);
  const propsRef = useRef({ nodeIds, nodeTips, edgeTips, selectedId });
  onSelectRef.current = onSelect;
  onTipRef.current = onTip;
  propsRef.current = { nodeIds, nodeTips, edgeTips, selectedId };

  const [markers, setMarkers] = useState<Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState({ width: 0, height: 320 });
  const [zoom, setZoom] = useState(1);
  const [lensMarkup, setLensMarkup] = useState("");
  const [lensPoint, setLensPoint] = useState<{ x: number; y: number } | null>(null);
  const [lensZoom, setLensZoom] = useState(2);
  const [viewportMaxHeight, setViewportMaxHeight] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const pendingFit = useRef(true);
  const fitSvgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
    zooming: boolean;
    startZoom: number;
  } | null>(null);
  zoomRef.current = zoom;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    pendingFit.current = true;
    fitSvgRef.current = null;

    const measure = () => {
      try {
      const svg = host.querySelector("svg");
      const stage = host.parentElement;
      if (!svg || !stage || cancelled) return;
      const { nodeIds: ids, nodeTips: tipsForNodes, edgeTips: tipsForEdges, selectedId: current } = propsRef.current;
      const known = new Set(ids);
      const stageRect = stage.getBoundingClientRect();
      const scale = zoomRef.current;
      const next: Marker[] = [];
      const nodeRects = new Map<string, DOMRect>();

      svg.querySelectorAll("g.node").forEach((node) => {
        const id = matchNodeId(node.id, known);
        if (!id) return;
        node.classList.toggle("is-selected", id === current);
        const rect = node.getBoundingClientRect();
        nodeRects.set(id, rect);
        const tip = tipsForNodes.find((item) => item.id === id);
        if (!tip) return;
        next.push({
          key: `node-${id}`,
          tipId: tip.tipId,
          nodeId: id,
          label: tip.label,
          x: (rect.right - stageRect.left - 16 * scale) / scale,
          y: (rect.top - stageRect.top - 8 * scale) / scale,
        });
      });

      const claimed = new Set<string>();
      svg.querySelectorAll("path.flowchart-link, .edge path, g.edge path").forEach((path) => {
        const line = path as SVGPathElement;
        const ownerId = line.id || line.closest("g")?.id || "";
        const idMatch = ownerId.match(/L_(.+)_(\d+)$/);
        let from: string | null = null;
        let to: string | null = null;
        if (idMatch) {
          const body = idMatch[1];
          const hit = tipsForEdges.find((tip) => body === `${tip.from}_${tip.to}` || ownerId.endsWith(`L_${tip.from}_${tip.to}_${idMatch[2]}`));
          if (hit) {
            from = hit.from;
            to = hit.to;
          }
        }
        if (!from || !to) {
          const length = line.getTotalLength?.() ?? 0;
          if (!length) return;
          const ctm = line.getScreenCTM();
          if (!ctm) return;
          const screenAt = (at: number) => {
            const local = line.getPointAtLength(at);
            const point = svg.createSVGPoint();
            point.x = local.x;
            point.y = local.y;
            return point.matrixTransform(ctm);
          };
          const start = screenAt(1);
          const end = screenAt(Math.max(length - 1, 1));
          const nearest = (point: DOMPoint) => {
            let best: string | null = null;
            let bestDist = 48;
            for (const [id, rect] of nodeRects) {
              const dist = distToRect(point.x, point.y, rect);
              if (dist < bestDist) {
                best = id;
                bestDist = dist;
              }
            }
            return best;
          };
          from = nearest(start);
          to = nearest(end);
        }
        if (!from || !to) return;
        const tip = tipsForEdges.find((item) => item.from === from && item.to === to);
        if (!tip || claimed.has(`${from}->${to}`)) return;
        claimed.add(`${from}->${to}`);
        const length = line.getTotalLength?.() ?? 0;
        const ctm = line.getScreenCTM();
        if (!length || !ctm) return;
        const local = line.getPointAtLength(length / 2);
        const point = svg.createSVGPoint();
        point.x = local.x;
        point.y = local.y;
        const mid = point.matrixTransform(ctm);
        next.push({
          key: `edge-${from}-${to}`,
          tipId: tip.tipId,
          label: tip.label,
          x: (mid.x - stageRect.left - 10 * scale) / scale,
          y: (mid.y - stageRect.top - 22 * scale) / scale,
        });
      });

      const bounds = svg.getBoundingClientRect();
      const viewBox = svg.viewBox?.baseVal;
      const naturalWidth = viewBox && viewBox.width > 0 ? viewBox.width : bounds.width / scale;
      const naturalHeight = viewBox && viewBox.height > 0 ? viewBox.height : bounds.height / scale;
      setBox({
        width: naturalWidth,
        height: Math.max(naturalHeight, 280),
      });
      const available = viewportRef.current?.clientWidth ?? 0;
      const fittedZoom = zoomThatFitsWidth(naturalWidth, available);
      // A new answer resizes the question dock before Mermaid replaces the SVG.
      // Fitting that earlier chart clears the one-shot fit, so only the SVG from this render counts.
      if (pendingFit.current && svg === fitSvgRef.current && fittedZoom != null) {
        pendingFit.current = false;
        zoomRef.current = fittedZoom;
        setZoom(fittedZoom);
      }
      const zoomForFrame = fittedZoom ?? scale;
      const dock = document.querySelector(".question-dock");
      const dockHeight = dock?.getBoundingClientRect().height ?? 0;
      const room = Math.max(280, window.innerHeight - dockHeight - 88);
      const wide = available > 0 && naturalWidth > available - 24;
      const fittedHeight = Math.max(naturalHeight, 280) * (wide ? zoomForFrame : 1);
      setViewportMaxHeight(wide ? Math.min(Math.max(fittedHeight, 360), room) : Math.min(room, window.innerHeight * 0.78));
      setMarkers(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not place the info buttons.");
        }
      }
    };

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!mermaidReady) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            flowchart: { htmlLabels: true, wrappingWidth: 260, nodeSpacing: 28, rankSpacing: 48 },
            theme: "base",
            themeVariables: {
              background: "#fffdf8",
              primaryColor: "#fffdf8",
              primaryTextColor: "#1c1917",
              primaryBorderColor: "#44403c",
              lineColor: "#78716c",
              fontFamily: "var(--font-body), Source Sans 3, sans-serif",
              fontSize: "15px",
            },
          });
          mermaidReady = true;
        }
        renderSeq += 1;
        const { svg } = await mermaid.render(`ftucheck${renderSeq}`, source);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        const drawn = hostRef.current.querySelector("svg");
        fitSvgRef.current = drawn instanceof SVGSVGElement ? drawn : null;
        if (drawn) {
          const viewBox = drawn.viewBox.baseVal;
          if (viewBox.width > 0 && viewBox.height > 0) {
            drawn.setAttribute("width", String(viewBox.width));
            drawn.setAttribute("height", String(viewBox.height));
            drawn.style.width = `${viewBox.width}px`;
            drawn.style.height = `${viewBox.height}px`;
          }
          drawn.style.maxWidth = "none";
          setLensMarkup(drawn.outerHTML);
        }
        hostRef.current.querySelectorAll("g.node").forEach((node) => {
          const id = matchNodeId(node.id, new Set(propsRef.current.nodeIds));
          if (!id) return;
          (node as SVGElement).onclick = (event) => {
            event.stopPropagation();
            onSelectRef.current(id);
          };
        });
        setError(null);
        requestAnimationFrame(() => measure());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "The chart could not be drawn.");
          setMarkers([]);
        }
      }
    })();

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const dock = document.querySelector(".question-dock");
    const dockObserver = dock ? new ResizeObserver(() => measure()) : null;
    dockObserver?.observe(dock!);
    const hostObserver = new ResizeObserver(() => measure());
    hostObserver.observe(host);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      dockObserver?.disconnect();
      hostObserver.disconnect();
    };
  }, [source]);

  useEffect(() => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg) return;
    const known = new Set(nodeIds);
    svg.querySelectorAll("g.node").forEach((node) => {
      const id = matchNodeId(node.id, known);
      node.classList.toggle("is-selected", id === selectedId);
    });
  }, [selectedId, nodeIds, source]);

  function flashLevelNode(id: string) {
    onSelect(id);
    const svg = hostRef.current?.querySelector("svg");
    const viewport = viewportRef.current;
    if (!svg || !viewport) return;
    const known = new Set(nodeIds);
    const matches: Element[] = [];
    svg.querySelectorAll("g.node").forEach((node) => {
      const match = matchNodeId(node.id, known) === id;
      node.classList.toggle("is-flash", match);
      if (match) matches.push(node);
    });
    const target = matches[0];
    if (target) {
      const nodeRect = target.getBoundingClientRect();
      const viewRect = viewport.getBoundingClientRect();
      viewport.scrollTo({
        left: viewport.scrollLeft + nodeRect.left - viewRect.left - viewRect.width / 2 + nodeRect.width / 2,
        top: viewport.scrollTop + nodeRect.top - viewRect.top - viewRect.height / 2 + nodeRect.height / 2,
        behavior: "smooth",
      });
    }
    window.setTimeout(() => {
      svg.querySelectorAll("g.node.is-flash").forEach((node) => node.classList.remove("is-flash"));
    }, 1500);
  }

  function stepLens(direction: -1 | 1) {
    setLensZoom((current) => {
      const index = Math.max(0, lensZooms.indexOf(current));
      return lensZooms[Math.min(lensZooms.length - 1, Math.max(0, index + direction))];
    });
  }

  function fitZoom() {
    const svg = hostRef.current?.querySelector("svg");
    const viewBox = svg?.viewBox?.baseVal;
    const naturalWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
    const nextZoom = zoomThatFitsWidth(naturalWidth, viewportRef.current?.clientWidth ?? 0);
    if (nextZoom == null) return;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }

  function updateLens(event: PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    setLensPoint({
      x: (event.clientX - canvasRect.left) / zoom,
      y: (event.clientY - canvasRect.top) / zoom,
    });
  }

  function onViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false,
      zooming: event.metaKey && event.shiftKey,
      startZoom: zoomRef.current,
    };
  }

  function onViewportPointerMove(event: PointerEvent<HTMLDivElement>) {
    updateLens(event);
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (!pan.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      pan.moved = true;
      setPanning(true);
      try {
        viewport.setPointerCapture(event.pointerId);
      } catch {
        // Capture is optional. The drag still pans while the pointer is over the chart.
      }
    }
    if (pan.zooming) {
      // Up increases zoom, down decreases it. Same floor as fit and same ceiling as the zoom-in button.
      const next = Math.min(2, Math.max(0.05, pan.startZoom * Math.exp(-dy / 160)));
      if (next !== zoomRef.current) {
        zoomRef.current = next;
        setZoom(next);
      }
      return;
    }
    viewport.scrollLeft = pan.scrollLeft - dx;
    viewport.scrollTop = pan.scrollTop - dy;
  }

  function endPan(event: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || event.pointerId !== pan.pointerId) return;
    if (pan.moved) {
      const swallow = (clickEvent: MouseEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        viewport.removeEventListener("click", swallow, true);
      };
      viewport.addEventListener("click", swallow, true);
      requestAnimationFrame(() => viewport.removeEventListener("click", swallow, true));
    }
    panRef.current = null;
    setPanning(false);
    try {
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone.
    }
  }

  return (
    <div className="rounded-md border border-stone-300 bg-[#fffdf8]">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-stone-200 px-3 py-2" role="group" aria-label="Chart zoom controls">
        <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => setZoom((current) => Math.max(0.35, current - 0.15))} aria-label="Zoom out">
          −
        </button>
        <output className="min-w-12 text-center text-sm text-stone-700" aria-label={`Zoom level ${Math.round(zoom * 100)} percent`}>
          {Math.round(zoom * 100)}%
        </output>
        <button type="button" className="btn-secondary" onClick={() => setZoom((current) => Math.min(2, current + 0.15))} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="btn-secondary" onClick={fitZoom}>
          Fit zoom
        </button>
        </div>
      </div>
      <div className="chart-viewport-shell">
        <div
          ref={viewportRef}
          className={panning ? "chart-viewport is-panning" : "chart-viewport"}
          style={viewportMaxHeight ? { maxHeight: viewportMaxHeight } : undefined}
          tabIndex={0}
          role="region"
          aria-label="Decision chart. Drag to pan. With Command and Shift held, drag up to zoom in and down to zoom out. Arrow keys scroll."
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onPointerLeave={(event) => {
            setLensPoint(null);
            const pan = panRef.current;
            if (pan && !pan.moved && event.pointerId === pan.pointerId) panRef.current = null;
          }}
          onDragStart={(event) => event.preventDefault()}
        >
          <div className="relative" style={{ width: "max-content", minWidth: "100%", height: box.height * zoom }}>
            <div
              ref={canvasRef}
              className="relative"
              style={{ width: box.width ? box.width * zoom : "100%", height: box.height * zoom, marginInline: "auto" }}
            >
            <div
              className="relative origin-top-left"
              style={{ width: box.width || "100%", height: box.height, transform: `scale(${zoom})` }}
            >
              <div ref={hostRef} className="mermaid-host" />
              <div className="pointer-events-none absolute inset-0">
                {markers.map((marker) => (
                  <button
                    key={marker.key}
                    type="button"
                    className="info-dot pointer-events-auto"
                    style={{ left: marker.x, top: marker.y }}
                    aria-label={marker.label}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTipRef.current(marker.tipId, marker.nodeId);
                    }}
                  >
                    i
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>
        </div>
        <div className="chart-level-navigator">
          {levelExpanded ? (
            <div className="chart-level-list" role="list" aria-label="Nodes at this chart level">
              {levelNodes.map((node) => {
                const active = node.id === selectedId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    role="listitem"
                    className={active ? "chart-level-node chart-level-node-active" : "chart-level-node"}
                    aria-current={active ? "true" : undefined}
                    onClick={() => flashLevelNode(node.id)}
                  >
                    {node.title}
                  </button>
                );
              })}
            </div>
          ) : null}
          <button type="button" className="chart-level-toggle" aria-expanded={levelExpanded} onClick={onToggleLevel}>
            Level&apos;s nodes ({levelNodes.length}) <span aria-hidden="true">{levelExpanded ? "−" : "+"}</span>
          </button>
        </div>
        <div className="chart-magnifier" aria-live="polite" aria-label="Magnified chart area under the pointer">
          {lensPoint && lensMarkup ? (
            <div className="chart-magnifier-content" style={{ transform: `scale(${lensZoom}) translate(${352 / (2 * lensZoom) - lensPoint.x}px, ${136 / (2 * lensZoom) - lensPoint.y}px)` }} dangerouslySetInnerHTML={{ __html: lensMarkup }} />
          ) : (
            <span className="chart-magnifier-empty" aria-hidden="true">⌕</span>
          )}
          <div className="chart-magnifier-zoom" role="group" aria-label="Magnifier zoom">
            <button type="button" aria-label="Decrease magnifier zoom" disabled={lensZoom <= lensZooms[0]} onClick={() => stepLens(-1)}>
              −
            </button>
            <span>{lensZoom}×</span>
            <button type="button" aria-label="Increase magnifier zoom" disabled={lensZoom >= lensZooms[lensZooms.length - 1]} onClick={() => stepLens(1)}>
              +
            </button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          The chart could not be drawn. {error}
        </p>
      ) : null}
    </div>
  );
}
