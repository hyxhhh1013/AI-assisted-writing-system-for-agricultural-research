"use client";

import { useMemo } from "react";
import type { FlowEdge, FlowNode } from "@/services/mol-diagram";

interface FlowStructurePreviewProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  direction?: "vertical" | "horizontal";
  className?: string;
}

const ROLE_FILL: Record<string, string> = {
  process: "#E8EEF6",
  decision: "#F7EDE6",
  start_end: "#E8F5E9",
  callout: "#F5F5F5",
};

const ROLE_STROKE: Record<string, string> = {
  process: "#0F4D92",
  decision: "#B64342",
  start_end: "#2E7D32",
  callout: "#666666",
};

/**
 * 轻量结构预览（无第三方画布依赖）：按拓扑分层排布节点，实时反映表单编辑。
 */
export function FlowStructurePreview({
  nodes,
  edges,
  direction = "vertical",
  className,
}: FlowStructurePreviewProps) {
  const layout = useMemo(() => {
    const labeled = nodes.filter((n) => n.label.trim());
    if (labeled.length === 0) return null;

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
      // 若图有环或未达节点，收尾补上
      if (next.length === 0 && placed.size < labeled.length) {
        const rest = labeled.map((n) => n.id).filter((id) => !placed.has(id));
        if (rest.length) layers.push(rest);
        break;
      }
      frontier = next;
    }

    const byId = new Map(labeled.map((n) => [n.id, n]));
    const isVert = direction !== "horizontal";
    const layerGap = 88;
    const nodeGap = 110;
    const nodeW = 96;
    const nodeH = 36;

    const positions = new Map<string, { x: number; y: number }>();
    let maxW = 0;
    let maxH = 0;
    layers.forEach((layer, li) => {
      const span = (layer.length - 1) * nodeGap;
      layer.forEach((id, ni) => {
        const offset = ni * nodeGap - span / 2;
        const x = isVert ? 200 + offset : 40 + li * layerGap;
        const y = isVert ? 36 + li * layerGap : 120 + offset;
        positions.set(id, { x, y });
        maxW = Math.max(maxW, x + nodeW + 24);
        maxH = Math.max(maxH, y + nodeH + 24);
      });
    });

    return {
      byId,
      positions,
      validEdges,
      width: Math.max(maxW, 360),
      height: Math.max(maxH, 160),
      nodeW,
      nodeH,
    };
  }, [nodes, edges, direction]);

  if (!layout) {
    return (
      <div className={`rounded-md border border-dashed bg-white p-3 text-[10px] text-[#6b7c72] ${className ?? ""}`}>
        添加至少 1 个带名称的节点后显示结构预览
      </div>
    );
  }

  const { byId, positions, validEdges, width, height, nodeW, nodeH } = layout;

  return (
    <div className={`overflow-auto rounded-md border bg-white ${className ?? ""}`}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="min-h-[140px]">
        <defs>
          <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#5B7EA8" />
          </marker>
        </defs>
        {validEdges.map((e, i) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + nodeW / 2;
          const y1 = a.y + nodeH / 2;
          const x2 = b.x + nodeW / 2;
          const y2 = b.y + nodeH / 2;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={`${e.from}-${e.to}-${i}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#5B7EA8"
                strokeWidth={1.4}
                markerEnd="url(#flow-arrow)"
              />
              {e.label ? (
                <text x={mx} y={my - 4} textAnchor="middle" fontSize={9} fill="#5B7EA8">
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {[...positions.entries()].map(([id, pos]) => {
          const n = byId.get(id);
          if (!n) return null;
          const role = n.role || "process";
          const fill = ROLE_FILL[role] || ROLE_FILL.process;
          const stroke = ROLE_STROKE[role] || ROLE_STROKE.process;
          const isDiamond = role === "decision";
          const cx = pos.x + nodeW / 2;
          const cy = pos.y + nodeH / 2;
          return (
            <g key={id}>
              {isDiamond ? (
                <polygon
                  points={`${cx},${pos.y} ${pos.x + nodeW},${cy} ${cx},${pos.y + nodeH} ${pos.x},${cy}`}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.4}
                />
              ) : role === "start_end" ? (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={nodeW / 2}
                  ry={nodeH / 2}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.4}
                />
              ) : (
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={nodeW}
                  height={nodeH}
                  rx={8}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.4}
                  strokeDasharray={role === "callout" ? "4 3" : undefined}
                />
              )}
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="#1A1A1A"
              >
                {n.label.length > 12 ? `${n.label.slice(0, 11)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="border-t px-2 py-1 text-[9px] text-[#6b7c72]">
        结构预览（非终稿）。点「生成」走 Graphviz 期刊排版。
      </p>
    </div>
  );
}
