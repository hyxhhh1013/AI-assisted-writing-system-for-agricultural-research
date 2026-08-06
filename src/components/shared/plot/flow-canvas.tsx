"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, MousePointer2, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { FlowEdge, FlowNode } from "@/services/mol-diagram";

export interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  direction?: "vertical" | "horizontal";
  onNodesChange: (nodes: FlowNode[]) => void;
  onEdgesChange: (edges: FlowEdge[]) => void;
  onAddNode?: () => void;
  className?: string;
  /** 紧凑高度（左侧 / 机理子图） */
  compact?: boolean;
  /** 右侧大预览：更大节点与画布高度 */
  roomy?: boolean;
}

const ROLE_FILL: Record<string, string> = {
  process: "#FFFFFF",
  decision: "#FFFFFF",
  start_end: "#FFFFFF",
  callout: "#FAFAFA",
};

const ROLE_STROKE: Record<string, string> = {
  process: "#0F4D92",
  decision: "#9A3412",
  start_end: "#166534",
  callout: "#666666",
};

const ROLE_ACCENT: Record<string, string> = {
  process: "#0F4D92",
  decision: "#9A3412",
  start_end: "#166534",
  callout: "#888888",
};

type PosMap = Record<string, { x: number; y: number }>;

function computeAutoLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: "vertical" | "horizontal",
  nodeW: number,
  nodeH: number,
  layerGap: number,
  nodeGap: number,
): PosMap {
  const labeled = nodes.length ? nodes : [];
  if (labeled.length === 0) return {};

  const idSet = new Set(labeled.map((n) => n.id));
  const validEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
  const indeg = new Map<string, number>();
  const outs = new Map<string, string[]>();
  for (const n of labeled) {
    indeg.set(n.id, 0);
    outs.set(n.id, []);
  }
  for (const e of validEdges) {
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    outs.get(e.from)?.push(e.to);
  }

  const layers: string[][] = [];
  const placed = new Set<string>();
  let frontier = labeled.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  if (frontier.length === 0) frontier = [labeled[0]!.id];

  while (frontier.length > 0 && placed.size < labeled.length) {
    const layer = frontier.filter((id) => !placed.has(id));
    if (layer.length === 0) break;
    layers.push(layer);
    layer.forEach((id) => placed.add(id));
    const next: string[] = [];
    for (const id of layer) {
      for (const t of outs.get(id) || []) {
        if (!placed.has(t) && !next.includes(t)) next.push(t);
      }
    }
    if (next.length === 0 && placed.size < labeled.length) {
      const rest = labeled.map((n) => n.id).filter((id) => !placed.has(id));
      if (rest.length) layers.push(rest);
      break;
    }
    frontier = next;
  }

  const isVert = direction !== "horizontal";
  const positions: PosMap = {};
  const originX = isVert ? Math.max(180, nodeW * 1.8) : 40;
  const originY = isVert ? 44 : Math.max(100, nodeH * 2.5);

  layers.forEach((layer, li) => {
    const span = (layer.length - 1) * nodeGap;
    layer.forEach((id, ni) => {
      const offset = ni * nodeGap - span / 2;
      positions[id] = {
        x: isVert ? originX + offset : originX + li * layerGap,
        y: isVert ? originY + li * layerGap : originY + offset,
      };
    });
  });

  return positions;
}

function edgeKey(e: FlowEdge): string {
  return `${e.from}->${e.to}:${e.label || ""}`;
}

/**
 * 轻量可拖拽流程画布（无 @xyflow）：拖节点、点连线、改标签；终稿仍走 Graphviz。
 */
export function FlowCanvas({
  nodes,
  edges,
  direction = "vertical",
  onNodesChange,
  onEdgesChange,
  onAddNode,
  className,
  compact,
  roomy,
}: FlowCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<"select" | "link">("select");
  const [positions, setPositions] = useState<PosMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const nodeW = roomy ? 128 : compact ? 92 : 108;
  const nodeH = roomy ? 46 : compact ? 34 : 40;
  const layerGap = roomy ? 108 : compact ? 78 : 92;
  const nodeGap = roomy ? 148 : compact ? 108 : 122;

  const nodeIdsKey = useMemo(() => nodes.map((n) => n.id).join(","), [nodes]);
  const edgeSig = useMemo(() => edges.map(edgeKey).join("|"), [edges]);

  // 节点增删或方向变化时自动补齐缺失坐标；已有拖拽位置尽量保留
  useEffect(() => {
    setPositions((prev) => {
      const auto = computeAutoLayout(nodes, edges, direction, nodeW, nodeH, layerGap, nodeGap);
      const next: PosMap = {};
      for (const n of nodes) {
        next[n.id] = prev[n.id] ?? auto[n.id] ?? { x: 40 + nodes.indexOf(n) * 20, y: 40 };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在拓扑/方向/尺寸变时重算缺失位
  }, [nodeIdsKey, direction, edgeSig, nodeW, nodeH, layerGap, nodeGap]);

  const relayout = useCallback(() => {
    setPositions(computeAutoLayout(nodes, edges, direction, nodeW, nodeH, layerGap, nodeGap));
  }, [nodes, edges, direction, nodeW, nodeH, layerGap, nodeGap]);

  const canvasSize = useMemo(() => {
    let maxW = roomy ? 520 : 360;
    let maxH = roomy ? 360 : compact ? 160 : 200;
    for (const n of nodes) {
      const p = positions[n.id];
      if (!p) continue;
      maxW = Math.max(maxW, p.x + nodeW + 40);
      maxH = Math.max(maxH, p.y + nodeH + 40);
    }
    return { width: maxW, height: maxH };
  }, [nodes, positions, compact, roomy, nodeW, nodeH]);

  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    onNodesChange(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const removeSelected = () => {
    if (selectedEdgeIdx !== null) {
      onEdgesChange(edges.filter((_, i) => i !== selectedEdgeIdx));
      setSelectedEdgeIdx(null);
      return;
    }
    if (!selectedId) return;
    onNodesChange(nodes.filter((n) => n.id !== selectedId));
    onEdgesChange(edges.filter((e) => e.from !== selectedId && e.to !== selectedId));
    setSelectedId(null);
    setLinkFrom(null);
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (mode === "link") {
      if (!linkFrom) {
        setLinkFrom(id);
        setSelectedId(id);
        return;
      }
      if (linkFrom !== id) {
        const exists = edges.some((ed) => ed.from === linkFrom && ed.to === id);
        if (!exists) {
          onEdgesChange([...edges, { from: linkFrom, to: id, label: "" }]);
        }
        setLinkFrom(null);
        setSelectedId(id);
      }
      return;
    }

    setSelectedId(id);
    setSelectedEdgeIdx(null);
    const p = positions[id] || { x: 0, y: 0 };
    const local = clientToSvg(e.clientX, e.clientY);
    dragRef.current = {
      id,
      startX: local.x,
      startY: local.y,
      origX: p.x,
      origY: p.y,
    };
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || mode !== "select") return;
    const local = clientToSvg(e.clientX, e.clientY);
    const dx = local.x - drag.startX;
    const dy = local.y - drag.startY;
    setPositions((prev) => ({
      ...prev,
      [drag.id]: {
        x: Math.max(8, drag.origX + dx),
        y: Math.max(8, drag.origY + dy),
      },
    }));
  };

  const onSvgPointerUp = () => {
    dragRef.current = null;
  };

  const commitEdit = () => {
    if (!editingId) return;
    updateNode(editingId, { label: editDraft.trim() || editDraft });
    setEditingId(null);
  };

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const validEdges = edges.filter((e) => byId.has(e.from) && byId.has(e.to));

  if (nodes.length === 0) {
    return (
      <div className={`rounded-md border border-dashed bg-white p-3 ${className ?? ""}`}>
        <p className="mb-2 text-[10px] text-[#6b7c72]">画布为空，添加节点后可拖拽与连线</p>
        {onAddNode ? (
          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={onAddNode}>
            <Plus className="mr-1 h-3 w-3" /> 添加节点
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-md border bg-white ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-[#faf9f6] px-1.5 py-1">
        <Button
          type="button"
          variant={mode === "select" ? "default" : "outline"}
          size="sm"
          className={`h-6 gap-0.5 text-[9px] ${mode === "select" ? "bg-[#1a5632] hover:bg-[#144228]" : ""}`}
          onClick={() => {
            setMode("select");
            setLinkFrom(null);
          }}
        >
          <MousePointer2 className="h-3 w-3" /> 拖拽
        </Button>
        <Button
          type="button"
          variant={mode === "link" ? "default" : "outline"}
          size="sm"
          className={`h-6 gap-0.5 text-[9px] ${mode === "link" ? "bg-[#1a5632] hover:bg-[#144228]" : ""}`}
          onClick={() => setMode("link")}
        >
          <Link2 className="h-3 w-3" /> 连线
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-6 gap-0.5 text-[9px]" onClick={relayout}>
          <RefreshCw className="h-3 w-3" /> 自动排布
        </Button>
        {onAddNode ? (
          <Button type="button" variant="outline" size="sm" className="h-6 gap-0.5 text-[9px]" onClick={onAddNode}>
            <Plus className="h-3 w-3" /> 节点
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-0.5 text-[9px]"
          disabled={!selectedId && selectedEdgeIdx === null}
          onClick={removeSelected}
        >
          <Trash2 className="h-3 w-3" /> 删除
        </Button>
      </div>

      {mode === "link" ? (
        <p className="border-b px-2 py-0.5 text-[9px] text-[#6b7c72]">
          {linkFrom
            ? `已选起点「${byId.get(linkFrom)?.label || linkFrom}」，再点目标节点完成连线`
            : "连线模式：依次点击起点 → 终点"}
        </p>
      ) : null}

      <div
        className={`overflow-auto ${
          roomy ? "min-h-[420px] max-h-[min(70vh,640px)] flex-1" : compact ? "max-h-[220px]" : "max-h-[320px]"
        }`}
      >
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
          className={`touch-none select-none ${roomy ? "min-h-[400px]" : compact ? "min-h-[140px]" : "min-h-[180px]"}`}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
          onPointerDown={() => {
            if (mode === "select") {
              setSelectedId(null);
              setSelectedEdgeIdx(null);
            }
          }}
        >
          <defs>
            <marker id="flow-canvas-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#5B7EA8" />
            </marker>
          </defs>

          {validEdges.map((e, i) => {
            const a = positions[e.from];
            const b = positions[e.to];
            if (!a || !b) return null;
            const x1 = a.x + nodeW / 2;
            const y1 = a.y + nodeH / 2;
            const x2 = b.x + nodeW / 2;
            const y2 = b.y + nodeH / 2;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const active = selectedEdgeIdx === i;
            return (
              <g
                key={`${e.from}-${e.to}-${i}`}
                className="cursor-pointer"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  if (mode !== "select") return;
                  setSelectedId(null);
                  setSelectedEdgeIdx(i);
                }}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={active ? "#1a5632" : "#5B7EA8"}
                  strokeWidth={active ? 2.4 : 1.6}
                  markerEnd="url(#flow-canvas-arrow)"
                />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10} />
                {e.label ? (
                  <text x={mx} y={my - 4} textAnchor="middle" fontSize={roomy ? 11 : 9} fill={active ? "#1a5632" : "#5B7EA8"}>
                    {e.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {nodes.map((n) => {
            const pos = positions[n.id];
            if (!pos) return null;
            const role = n.role || "process";
            const fill = ROLE_FILL[role] || ROLE_FILL.process;
            const stroke =
              selectedId === n.id || linkFrom === n.id
                ? "#1a5632"
                : ROLE_STROKE[role] || ROLE_STROKE.process;
            const accent = n.color || ROLE_ACCENT[role] || ROLE_ACCENT.process;
            const strokeW = selectedId === n.id || linkFrom === n.id ? 2.4 : 1.4;
            const isDiamond = role === "decision";
            const cx = pos.x + nodeW / 2;
            const cy = pos.y + nodeH / 2;
            const label = n.label.trim() || `(${n.id})`;
            const fontSize = roomy ? 12 : 10;

            return (
              <g
                key={n.id}
                className={mode === "link" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}
                onPointerDown={(ev) => onNodePointerDown(ev, n.id)}
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  setEditingId(n.id);
                  setEditDraft(n.label);
                  setMode("select");
                }}
              >
                {isDiamond ? (
                  <polygon
                    points={`${cx},${pos.y} ${pos.x + nodeW},${cy} ${cx},${pos.y + nodeH} ${pos.x},${cy}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeW}
                  />
                ) : role === "start_end" ? (
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={nodeW / 2}
                    ry={nodeH / 2}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeW}
                  />
                ) : (
                  <>
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={nodeW}
                      height={nodeH}
                      rx={2}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      strokeDasharray={role === "callout" ? "4 3" : undefined}
                    />
                    {/* 左侧色条 — 对齐终稿 journal 风格 */}
                    <rect x={pos.x + 1} y={pos.y + 1} width={6} height={nodeH - 2} fill={accent} />
                  </>
                )}
                <text
                  x={role === "process" || role === "callout" ? pos.x + 14 + (nodeW - 14) / 2 : cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fontWeight={600}
                  fill="#1A1A1A"
                  style={{ pointerEvents: "none" }}
                >
                  {label.length > (roomy ? 16 : 12) ? `${label.slice(0, roomy ? 15 : 11)}…` : label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {editingId ? (
        <div className="flex items-center gap-1 border-t px-2 py-1">
          <span className="text-[9px] text-[#6b7c72]">改标签</span>
          <Input
            autoFocus
            className="h-6 flex-1 text-[10px]"
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
          <Button size="sm" className="h-6 text-[9px] bg-[#1a5632] hover:bg-[#144228]" onClick={commitEdit}>
            确定
          </Button>
        </div>
      ) : (
        <p className="border-t px-2 py-1 text-[9px] text-[#6b7c72]">
          {roomy
            ? "右侧大画布编排结构；生成后这里会换成期刊终稿，画布回到左侧。"
            : "画布仅供编排；双击改名。点「生成」走 Graphviz 期刊排版（拖拽位置不写入终稿）。"}
        </p>
      )}

      {selectedEdgeIdx !== null && edges[selectedEdgeIdx] ? (
        <div className="flex items-center gap-1 border-t px-2 py-1">
          <span className="text-[9px] text-[#6b7c72]">边标签</span>
          <Input
            className="h-6 flex-1 text-[10px]"
            value={edges[selectedEdgeIdx]!.label || ""}
            placeholder="如 yes / solid"
            onChange={(e) => {
              const next = [...edges];
              next[selectedEdgeIdx] = { ...next[selectedEdgeIdx]!, label: e.target.value };
              onEdgesChange(next);
            }}
          />
        </div>
      ) : null}

      {selectedId ? (
        <div className="flex items-center gap-1 border-t px-2 py-1">
          <span className="text-[9px] text-[#6b7c72]">角色</span>
          <select
            className="h-6 rounded border bg-background text-[10px]"
            value={byId.get(selectedId)?.role || "process"}
            onChange={(e) => {
              const role = e.target.value as FlowNode["role"];
              const shape: FlowNode["shape"] =
                role === "decision" ? "diamond" : role === "start_end" ? "oval" : "box";
              updateNode(selectedId, { role, shape });
            }}
          >
            <option value="process">过程</option>
            <option value="decision">判定</option>
            <option value="start_end">起止</option>
            <option value="callout">标注</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
