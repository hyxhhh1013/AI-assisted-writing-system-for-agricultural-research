"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, GitBranch, FileText, Expand, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { renderFlowChart } from "@/services/mol-diagram";
import type { FlowNode, FlowEdge } from "@/services/mol-diagram";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface FlowCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

export function FlowCard({ onInsertToPaper, onPreview }: FlowCardProps) {
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

  const addNode = () => {
    const id = String(nextId);
    setNodes([...nodes, { id, label: "", shape: "box" }]);
    setNextId(nextId + 1);
  };

  const updateNode = (id: string, field: keyof FlowNode, value: string) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, [field]: value } : n));
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter(n => n.id !== id));
    setEdges(edges.filter(e => e.from !== id && e.to !== id));
  };

  const addEdge = () => {
    setEdges([...edges, { from: "", to: "" }]);
  };

  const updateEdge = (idx: number, field: keyof FlowEdge, value: string) => {
    const next = [...edges];
    next[idx] = { ...next[idx], [field]: value };
    setEdges(next);
  };

  const removeEdge = (idx: number) => {
    setEdges(edges.filter((_, i) => i !== idx));
  };

  const handleRun = async () => {
    const validNodes = nodes.filter(n => n.label.trim());
    if (validNodes.length < 2) { toast.error("至少需要两个节点"); return; }
    setLoading(true);
    try {
      const json = await renderFlowChart({
        title: title || undefined,
        direction,
        cols: parseInt(cols) || 3,
        nodes: validNodes,
        edges: edges.filter(e => e.from && e.to),
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl });
      toast.success("流程图生成成功");
    } catch (err: unknown) { toast.error(err instanceof Error ? getErrorMessage(err) : "生成失败"); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4" />流程图</CardTitle>
        <CardDescription className="text-xs">实验流程 / 工艺流程图</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">用法说明</summary>
          <p className="mt-1">添加流程节点（□ 矩形 / ○ 椭圆 / ◇ 菱形）并设置连线，调整列数和方向后生成自动排版的流程图。支持连线标签。</p>
        </details>
        <div><Label className="text-xs">标题</Label><Input value={title} onChange={e => setTitle(e.target.value)} className="text-xs h-7 mt-0.5" /></div>
        <div className="flex gap-2">
          <div className="flex-1"><Label className="text-xs">方向</Label>
            <div className="flex h-7 border rounded-md overflow-hidden mt-0.5">
              <button className={`flex-1 text-[10px] ${direction === "vertical" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setDirection("vertical")}>纵向</button>
              <button className={`flex-1 text-[10px] ${direction === "horizontal" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setDirection("horizontal")}>横向</button>
            </div>
          </div>
          <div className="w-16"><Label className="text-xs">列数</Label><Input value={cols} onChange={e => setCols(e.target.value)} className="text-xs h-7 mt-0.5" type="number" min="1" max="6" /></div>
        </div>

        <div><div className="flex items-center justify-between mb-1"><Label className="text-xs">节点</Label><Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addNode}><Plus className="h-3 w-3 mr-0.5" />添加</Button></div>
          {nodes.map(n => (
            <div key={n.id} className="flex gap-1 mb-1">
              <Input className="text-[10px] h-7 flex-1" placeholder="节点名称" value={n.label} onChange={e => updateNode(n.id, "label", e.target.value)} />
              <select className="text-[10px] h-7 w-14 rounded border bg-background" value={n.shape} onChange={e => updateNode(n.id, "shape", e.target.value)}>
                <option value="box">□</option><option value="oval">○</option><option value="diamond">◇</option>
              </select>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeNode(n.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>

        <div><div className="flex items-center justify-between mb-1"><Label className="text-xs">连线</Label><Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addEdge}><Plus className="h-3 w-3 mr-0.5" />添加</Button></div>
          {edges.map((e, i) => (
            <div key={i} className="flex gap-1 mb-1 items-center">
              <select className="text-[10px] h-7 flex-1 rounded border bg-background" value={e.from} onChange={e2 => updateEdge(i, "from", e2.target.value)}>
                <option value="">起点</option>{nodes.filter(n => n.label.trim()).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <span className="text-muted-foreground text-[10px]">→</span>
              <select className="text-[10px] h-7 flex-1 rounded border bg-background" value={e.to} onChange={e2 => updateEdge(i, "to", e2.target.value)}>
                <option value="">终点</option>{nodes.filter(n => n.label.trim()).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeEdge(i)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>

        <Button className="w-full h-8 text-xs" onClick={handleRun} disabled={loading}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 生成中...</> : <><GitBranch className="h-3.5 w-3.5 mr-1" /> 生成流程图</>}
        </Button>
        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-white group cursor-pointer"
              onClick={() => onPreview({ src: result.imageBase64, caption: `流程图 — ${title}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="Flow" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            <Button variant="default" size="sm" className="w-full h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, `流程图 — ${title}`)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
