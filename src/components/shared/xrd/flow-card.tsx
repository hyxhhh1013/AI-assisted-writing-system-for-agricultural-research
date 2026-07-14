"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { renderFlowChart } from "@/services/mol-diagram";
import type { FlowNode, FlowEdge } from "@/services/mol-diagram";
import { getErrorMessage } from "@/lib/error-utils";
import type { FlowPanelPrefill } from "@/contracts/figure";
import { buildPlotInsertReplay } from "@/contracts/figure";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";

interface FlowCardProps extends PlotToolProps {
  prefill?: FlowPanelPrefill | null;
}

export function FlowCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  prefill,
}: FlowCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string } | null>(null);
  const [title, setTitle] = useState("实验流程图");
  const [direction, setDirection] = useState<"vertical" | "horizontal">("vertical");
  const [cols, setCols] = useState("3");
  const [nodes, setNodes] = useState<FlowNode[]>([
    { id: "1", label: "原料处理", shape: "box" },
    { id: "2", label: "反应过程", shape: "box" },
    { id: "3", label: "产物分离", shape: "diamond" },
  ]);
  const [edges, setEdges] = useState<FlowEdge[]>([
    { from: "1", to: "2" },
    { from: "2", to: "3" },
  ]);
  const [nextId, setNextId] = useState(4);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.title) setTitle(prefill.title);
    if (prefill.direction) setDirection(prefill.direction);
    if (prefill.nodes && prefill.nodes.length > 0) {
      const mapped: FlowNode[] = prefill.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        shape: (n.shape === "oval" || n.shape === "diamond" ? n.shape : "box") as FlowNode["shape"],
      }));
      setNodes(mapped);
      const maxNum = mapped.reduce((max, n) => {
        const num = Number.parseInt(n.id, 10);
        return Number.isNaN(num) ? max : Math.max(max, num);
      }, 0);
      setNextId(maxNum + 1);
    }
    if (prefill.edges && prefill.edges.length > 0) {
      setEdges(prefill.edges);
    }
  }, [prefill]);

  const addNode = () => {
    const id = String(nextId);
    setNodes([...nodes, { id, label: "", shape: "box" }]);
    setNextId(nextId + 1);
  };

  const updateNode = (id: string, field: keyof FlowNode, value: string) => {
    setNodes(nodes.map((n) => (n.id === id ? { ...n, [field]: value } : n)));
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.from !== id && e.to !== id));
  };

  const addEdge = () => setEdges([...edges, { from: "", to: "" }]);

  const updateEdge = (idx: number, field: keyof FlowEdge, value: string) => {
    const next = [...edges];
    next[idx] = { ...next[idx], [field]: value };
    setEdges(next);
  };

  const removeEdge = (idx: number) => setEdges(edges.filter((_, i) => i !== idx));

  const canGenerate = nodes.filter((n) => n.label.trim()).length >= 2;

  const handleRun = async () => {
    const validNodes = nodes.filter((n) => n.label.trim());
    if (validNodes.length < 2) {
      toast.error("至少需要两个节点");
      return;
    }
    setLoading(true);
    try {
      const json = await renderFlowChart({
        title: title || undefined,
        direction,
        cols: parseInt(cols) || 3,
        nodes: validNodes,
        edges: edges.filter((e) => e.from && e.to),
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl });
      toast.success("流程图生成成功");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (!result) return;
    const caption = `流程图 — ${title}`;
    onInsertToPaper(result.imageUrl, caption, buildPlotInsertReplay("flow", caption, {
      title,
      direction,
      nodes: nodes
        .filter((n) => n.label.trim())
        .map((n) => ({ id: n.id, label: n.label, shape: n.shape })),
      edges: edges.filter((e) => e.from && e.to),
    }));
  };

  return (
    <PlotWorkspace
      title={toolTitle ?? "流程图 / 机理图"}
      description={description ?? "实验流程或反应机理：节点 + 连线自动排版"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <details className="rounded bg-[#faf9f6] p-2 text-[10px] leading-relaxed text-[#6b7c72]">
              <summary className="cursor-pointer font-medium">用法说明</summary>
              <p className="mt-1">添加流程节点（□ 矩形 / ○ 椭圆 / ◇ 菱形）并设置连线，调整列数和方向后生成。</p>
            </details>
            <div>
              <Label className="text-xs">标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">方向</Label>
                <div className="mt-0.5 flex h-8 overflow-hidden rounded-md border">
                  <button
                    type="button"
                    className={`flex-1 text-[10px] ${direction === "vertical" ? "bg-[#1a5632] text-white" : "bg-background"}`}
                    onClick={() => setDirection("vertical")}
                  >
                    纵向
                  </button>
                  <button
                    type="button"
                    className={`flex-1 text-[10px] ${direction === "horizontal" ? "bg-[#1a5632] text-white" : "bg-background"}`}
                    onClick={() => setDirection("horizontal")}
                  >
                    横向
                  </button>
                </div>
              </div>
              <div className="w-16">
                <Label className="text-xs">列数</Label>
                <Input value={cols} onChange={(e) => setCols(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" min="1" max="6" />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">节点</Label>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addNode}>
                  <Plus className="mr-0.5 h-3 w-3" />添加
                </Button>
              </div>
              {nodes.map((n) => (
                <div key={n.id} className="mb-1 flex gap-1">
                  <Input className="h-7 flex-1 text-[10px]" placeholder="节点名称" value={n.label} onChange={(e) => updateNode(n.id, "label", e.target.value)} />
                  <select className="h-7 w-14 rounded border bg-background text-[10px]" value={n.shape} onChange={(e) => updateNode(n.id, "shape", e.target.value)}>
                    <option value="box">□</option>
                    <option value="oval">○</option>
                    <option value="diamond">◇</option>
                  </select>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeNode(n.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">连线</Label>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addEdge}>
                  <Plus className="mr-0.5 h-3 w-3" />添加
                </Button>
              </div>
              {edges.map((e, i) => (
                <div key={i} className="mb-1 flex items-center gap-1">
                  <select className="h-7 flex-1 rounded border bg-background text-[10px]" value={e.from} onChange={(e2) => updateEdge(i, "from", e2.target.value)}>
                    <option value="">起点</option>
                    {nodes.filter((n) => n.label.trim()).map((n) => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <select className="h-7 flex-1 rounded border bg-background text-[10px]" value={e.to} onChange={(e2) => updateEdge(i, "to", e2.target.value)}>
                    <option value="">终点</option>
                    {nodes.filter((n) => n.label.trim()).map((n) => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeEdge(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="示意图预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={handleRun}
          generateLabel="生成流程图"
          imageSrc={result?.imageBase64}
          imageAlt={`流程图 — ${title}`}
          emptyHint="在左侧添加至少 2 个节点并设置连线。"
          footer={
            result ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                <Button
                  size="sm"
                  className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                  onClick={handleInsert}
                >
                  <BarChart3 className="h-3 w-3" /> 插入论文
                </Button>
              </div>
            ) : undefined
          }
        />
      }
    />
  );
}
