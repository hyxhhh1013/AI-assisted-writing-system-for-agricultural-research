"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { FlowCanvas } from "@/components/shared/plot/flow-canvas";
import type { FlowEdge, FlowNode } from "@/services/mol-diagram";

export interface FlowSubgraphValue {
  direction?: "vertical" | "horizontal";
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface FlowSubgraphEditorProps {
  value: FlowSubgraphValue;
  onChange: (next: FlowSubgraphValue) => void;
  compact?: boolean;
}

function nextNodeId(nodes: FlowNode[]): string {
  const max = nodes.reduce((m, n) => {
    const num = Number.parseInt(n.id, 10);
    return Number.isNaN(num) ? m : Math.max(m, num);
  }, 0);
  return String(max + 1);
}

/**
 * 流程子图轻量编辑器：可拖拽画布 + 节点/边表单（无第三方画布依赖）。
 */
export function FlowSubgraphEditor({ value, onChange, compact }: FlowSubgraphEditorProps) {
  const nodes = value.nodes || [];
  const edges = value.edges || [];
  const direction = value.direction || "vertical";

  const patch = (partial: Partial<FlowSubgraphValue>) => {
    onChange({ direction, nodes, edges, ...partial });
  };

  const updateNode = (id: string, p: Partial<FlowNode>) => {
    patch({
      nodes: nodes.map((n) => (n.id === id ? { ...n, ...p } : n)),
    });
  };

  const removeNode = (id: string) => {
    patch({
      nodes: nodes.filter((n) => n.id !== id),
      edges: edges.filter((e) => e.from !== id && e.to !== id),
    });
  };

  const addNode = () => {
    const id = nextNodeId(nodes);
    patch({
      nodes: [...nodes, { id, label: `N${id}`, shape: "box", role: "process" }],
    });
  };

  const updateEdge = (idx: number, field: keyof FlowEdge, v: string) => {
    const next = [...edges];
    next[idx] = { ...next[idx], [field]: v };
    patch({ edges: next });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-[10px]">方向</Label>
        <div className="flex h-6 overflow-hidden rounded border">
          <button
            type="button"
            className={`px-2 text-[9px] ${direction === "vertical" ? "bg-[#1a5632] text-white" : "bg-background"}`}
            onClick={() => patch({ direction: "vertical" })}
          >
            纵向
          </button>
          <button
            type="button"
            className={`px-2 text-[9px] ${direction === "horizontal" ? "bg-[#1a5632] text-white" : "bg-background"}`}
            onClick={() => patch({ direction: "horizontal" })}
          >
            横向
          </button>
        </div>
      </div>

      <FlowCanvas
        compact={compact}
        nodes={nodes}
        edges={edges}
        direction={direction}
        onNodesChange={(next) => patch({ nodes: next })}
        onEdgesChange={(next) => patch({ edges: next })}
        onAddNode={addNode}
      />

      <details className="rounded border bg-white px-1.5 py-1">
        <summary className="cursor-pointer text-[9px] text-[#6b7c72]">表单细调（可选）</summary>
        <div className="mt-1 space-y-1">
          {nodes.map((n) => (
            <div key={n.id} className="flex items-center gap-1">
              <span className="w-5 text-[9px] text-[#6b7c72]">{n.id}</span>
              <Input
                className="h-6 flex-1 text-[10px]"
                value={n.label}
                placeholder="节点名"
                onChange={(e) => updateNode(n.id, { label: e.target.value })}
              />
              <Select
                value={n.role || "process"}
                onValueChange={(v) => {
                  const role = v as FlowNode["role"];
                  const shape: FlowNode["shape"] =
                    role === "decision" ? "diamond" : role === "start_end" ? "oval" : "box";
                  updateNode(n.id, { role, shape });
                }}
              >
                <SelectTrigger className="h-6 w-[72px] text-[9px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="process">过程</SelectItem>
                  <SelectItem value="decision">判定</SelectItem>
                  <SelectItem value="start_end">起止</SelectItem>
                  <SelectItem value="callout">标注</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeNode(n.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {edges.map((e, i) => (
            <div key={i} className="flex items-center gap-1">
              <Select value={e.from || undefined} onValueChange={(v) => updateEdge(i, "from", v || "")}>
                <SelectTrigger className="h-6 w-14 text-[9px]">
                  <SelectValue placeholder="从" />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[9px] text-[#6b7c72]">→</span>
              <Select value={e.to || undefined} onValueChange={(v) => updateEdge(i, "to", v || "")}>
                <SelectTrigger className="h-6 w-14 text-[9px]">
                  <SelectValue placeholder="到" />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-6 flex-1 text-[10px]"
                placeholder="边标签"
                value={e.label || ""}
                onChange={(ev) => updateEdge(i, "label", ev.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => patch({ edges: edges.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
