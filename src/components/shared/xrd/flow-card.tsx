"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { renderFlowChart } from "@/services/mol-diagram";
import type { FlowEdge, FlowNode, FlowPreset } from "@/services/mol-diagram";
import { getErrorMessage } from "@/lib/error-utils";
import type { FlowPanelPrefill } from "@/contracts/figure";
import { buildPlotInsertReplay } from "@/contracts/figure";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import { FlowCanvas } from "@/components/shared/plot/flow-canvas";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";
import { downloadText, flowToDot, flowToMermaid, mermaidToFlow } from "@/lib/flow-diagram-io";
import { Textarea } from "@/components/ui/textarea";

interface FlowCardProps extends PlotToolProps {
  prefill?: FlowPanelPrefill | null;
}

type FlowTemplateId = "blank" | "experiment" | "dual_path" | "decision" | "biomass_pyrolysis";

const TEMPLATES: Record<
  FlowTemplateId,
  { name: string; title: string; nodes: FlowNode[]; edges: FlowEdge[]; direction: "vertical" | "horizontal" }
> = {
  blank: {
    name: "空白",
    title: "实验流程图",
    nodes: [
      { id: "1", label: "原料处理", shape: "box", role: "process" },
      { id: "2", label: "反应过程", shape: "box", role: "process" },
      { id: "3", label: "产物分离", shape: "diamond", role: "decision" },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
    ],
    direction: "vertical",
  },
  experiment: {
    name: "实验步骤",
    title: "Experimental workflow",
    nodes: [
      { id: "1", label: "Feedstock", shape: "oval", role: "start_end" },
      { id: "2", label: "Pretreatment", shape: "box", role: "process" },
      { id: "3", label: "Reaction", shape: "box", role: "process" },
      { id: "4", label: "Separation", shape: "diamond", role: "decision" },
      { id: "5", label: "Solid product", shape: "oval", role: "start_end" },
      { id: "6", label: "Liquid product", shape: "oval", role: "start_end" },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3", label: "T, P" },
      { from: "3", to: "4" },
      { from: "4", to: "5", label: "solid" },
      { from: "4", to: "6", label: "liquid" },
    ],
    direction: "vertical",
  },
  dual_path: {
    name: "双路径产物",
    title: "Two target-product pathways",
    nodes: [
      { id: "1", label: "M/BC", shape: "oval", role: "start_end" },
      { id: "2", label: "M/Z5", shape: "oval", role: "start_end" },
      { id: "3", label: "C5–C11", shape: "box", role: "process", color: "#8BCF8B" },
      { id: "4", label: "Deoxygenation", shape: "box", role: "process", color: "#42949E" },
      { id: "5", label: "Phenolic enrichment", shape: "box", role: "process", color: "#E67E22" },
      { id: "6", label: "Monocyclic aromatics", shape: "box", role: "process", color: "#D35400" },
      { id: "7", label: "CO-rich gas", shape: "oval", role: "start_end" },
      { id: "8", label: "Light gases", shape: "oval", role: "start_end" },
    ],
    edges: [
      { from: "1", to: "3" },
      { from: "2", to: "4" },
      { from: "3", to: "5" },
      { from: "4", to: "6" },
      { from: "5", to: "7", label: "volatiles" },
      { from: "6", to: "8", label: "light" },
    ],
    direction: "vertical",
  },
  decision: {
    name: "分支决策",
    title: "Decision workflow",
    nodes: [
      { id: "1", label: "Start", shape: "oval", role: "start_end" },
      { id: "2", label: "Key criterion?", shape: "diamond", role: "decision" },
      { id: "3", label: "Path A", shape: "box", role: "process" },
      { id: "4", label: "Path B", shape: "box", role: "process" },
      { id: "5", label: "Outcome", shape: "oval", role: "start_end" },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3", label: "yes" },
      { from: "2", to: "4", label: "no" },
      { from: "3", to: "5" },
      { from: "4", to: "5" },
    ],
    direction: "vertical",
  },
  biomass_pyrolysis: {
    name: "生物质热解",
    title: "Biomass pyrolysis pathway",
    nodes: [
      { id: "1", label: "Lignocellulose", shape: "oval", role: "start_end", color: "#2E7D32" },
      { id: "2", label: "Drying / milling", shape: "box", role: "process" },
      { id: "3", label: "Fast pyrolysis", shape: "box", role: "process", color: "#EF6C00" },
      { id: "4", label: "Phase separation", shape: "diamond", role: "decision" },
      { id: "5", label: "Bio-oil", shape: "oval", role: "start_end", color: "#EF6C00" },
      { id: "6", label: "Biochar", shape: "oval", role: "start_end", color: "#5D4037" },
      { id: "7", label: "Syngas", shape: "oval", role: "start_end", color: "#78909C" },
      { id: "8", label: "Upgrading?", shape: "diamond", role: "decision" },
      { id: "9", label: "Hydrodeoxygenation", shape: "box", role: "process", color: "#1565C0" },
      { id: "10", label: "Fuel-range products", shape: "oval", role: "start_end", color: "#6A1B9A" },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3", label: "500–600 °C" },
      { from: "3", to: "4" },
      { from: "4", to: "5", label: "liquid" },
      { from: "4", to: "6", label: "solid" },
      { from: "4", to: "7", label: "gas" },
      { from: "5", to: "8" },
      { from: "8", to: "9", label: "yes" },
      { from: "9", to: "10" },
    ],
    direction: "vertical",
  },
};

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function FlowCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  prefill,
}: FlowCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imageBase64: string;
    imageUrl: string;
    svgUrl?: string;
    pdfUrl?: string;
  } | null>(null);
  const [title, setTitle] = useState(TEMPLATES.blank.title);
  const [direction, setDirection] = useState<"vertical" | "horizontal">("vertical");
  const [preset, setPreset] = useState<FlowPreset>("nature");
  const [columns, setColumns] = useState<"1" | "2">("1");
  const [panelLabel, setPanelLabel] = useState("");
  const [template, setTemplate] = useState<FlowTemplateId>("blank");
  const [nodes, setNodes] = useState<FlowNode[]>(TEMPLATES.blank.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(TEMPLATES.blank.edges);
  const [nextId, setNextId] = useState(4);
  const [mermaidImport, setMermaidImport] = useState("");
  const [ioOpen, setIoOpen] = useState(false);
  /** canvas=右边大画布；result=右边终稿、左边小画布 */
  const [previewMode, setPreviewMode] = useState<"canvas" | "result">("canvas");

  useEffect(() => {
    if (result) setPreviewMode("result");
    else setPreviewMode("canvas");
  }, [result]);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.title) setTitle(prefill.title);
    if (prefill.direction) setDirection(prefill.direction);
    if (prefill.nodes && prefill.nodes.length > 0) {
      const mapped: FlowNode[] = prefill.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        shape: (n.shape === "oval" || n.shape === "diamond" ? n.shape : "box") as FlowNode["shape"],
        role:
          n.shape === "diamond" ? "decision" : n.shape === "oval" ? "start_end" : "process",
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

  const applyTemplate = (id: FlowTemplateId) => {
    const t = TEMPLATES[id];
    setTemplate(id);
    setTitle(t.title);
    setDirection(t.direction);
    setNodes(t.nodes.map((n) => ({ ...n })));
    setEdges(t.edges.map((e) => ({ ...e })));
    const maxNum = t.nodes.reduce((max, n) => {
      const num = Number.parseInt(n.id, 10);
      return Number.isNaN(num) ? max : Math.max(max, num);
    }, 0);
    setNextId(maxNum + 1);
    setResult(null);
  };

  const addNode = () => {
    const id = String(nextId);
    setNodes([...nodes, { id, label: "", shape: "box", role: "process" }]);
    setNextId(nextId + 1);
  };

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    setNodes(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.from !== id && e.to !== id));
  };

  const addEdge = () => setEdges([...edges, { from: "", to: "", label: "" }]);

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
        preset,
        panel_label: panelLabel,
        columns: Number(columns),
        look: "journal",
        export_formats: "png,svg,pdf",
        nodes: validNodes,
        edges: edges.filter((e) => e.from && e.to),
      });
      setResult({
        imageBase64: json.imageBase64,
        imageUrl: json.imageUrl,
        svgUrl: json.svgUrl,
        pdfUrl: json.pdfUrl,
      });
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
    onInsertToPaper(
      result.imageUrl,
      caption,
      buildPlotInsertReplay(
        "flow",
        caption,
        {
          title,
          direction,
          preset,
          panel_label: panelLabel,
          columns: Number(columns),
          nodes: nodes
            .filter((n) => n.label.trim())
            .map((n) => ({ id: n.id, label: n.label, shape: n.shape, role: n.role })),
          edges: edges.filter((e) => e.from && e.to),
        },
        { svgUrl: result.svgUrl, pdfUrl: result.pdfUrl },
      ),
    );
  };

  const showCanvasRight = previewMode === "canvas";
  const showCanvasLeft = previewMode === "result";

  const canvasBlock = (opts: { roomy?: boolean; compact?: boolean }) => (
    <FlowCanvas
      nodes={nodes}
      edges={edges}
      direction={direction}
      onNodesChange={(next) => {
        setNodes(next);
        // 改结构后仍可保留终稿，但提示可重新生成
      }}
      onEdgesChange={setEdges}
      onAddNode={addNode}
      roomy={opts.roomy}
      compact={opts.compact}
      className={opts.roomy ? "flex h-full min-h-[440px] flex-col" : undefined}
    />
  );

  const ioButtons = (
    <div className="mt-1 flex flex-wrap gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 text-[9px]"
        onClick={() => {
          downloadText(`${title || "flow"}.mmd`, flowToMermaid(nodes, edges, direction), "text/plain");
          toast.success("已导出 Mermaid");
        }}
      >
        导出 Mermaid
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 text-[9px]"
        onClick={() => {
          downloadText(`${title || "flow"}.dot`, flowToDot(nodes, edges, { title, direction }), "text/plain");
          toast.success("已导出 DOT");
        }}
      >
        导出 DOT
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-6 text-[9px]" onClick={() => setIoOpen((v) => !v)}>
        {ioOpen ? "收起导入" : "导入 Mermaid"}
      </Button>
    </div>
  );

  return (
    <PlotWorkspace
      title={toolTitle ?? "流程图 / 机理示意"}
      description={
        description ??
        "先在右侧大画布编排，再生成期刊终稿；生成后画布收至左侧，右侧看 PNG/SVG/PDF。"
      }
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div>
              <Label className="text-xs">模板</Label>
              <Select value={template} onValueChange={(v) => applyTemplate(v as FlowTemplateId)}>
                <SelectTrigger className="mt-0.5 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TEMPLATES) as FlowTemplateId[]).map((id) => (
                    <SelectItem key={id} value={id}>
                      {TEMPLATES[id].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">期刊预设</Label>
                <Select value={preset} onValueChange={(v) => setPreset(v as FlowPreset)}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nature">Nature</SelectItem>
                    <SelectItem value="agr_journal">农学刊</SelectItem>
                    <SelectItem value="print_bw">打印灰度</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <Label className="text-xs">栏宽</Label>
                <Select value={columns} onValueChange={(v) => setColumns(v === "2" ? "2" : "1")}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">单栏</SelectItem>
                    <SelectItem value="2">双栏</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-16">
                <Label className="text-xs">子图号</Label>
                <Input
                  value={panelLabel}
                  onChange={(e) => setPanelLabel(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  placeholder="c"
                />
              </div>
            </div>
            <div>
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

            {showCanvasLeft ? (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">画布（可继续改）</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[9px]"
                    onClick={() => setPreviewMode("canvas")}
                  >
                    放大到右侧
                  </Button>
                </div>
                {canvasBlock({ compact: true })}
                {ioButtons}
              </div>
            ) : (
              <p className="rounded border border-dashed bg-[#faf9f6] px-2 py-2 text-[10px] leading-relaxed text-[#6b7c72]">
                画布在<strong className="text-[#122820]">右侧预览区</strong>
                ：拖拽 / 连线 / 双击改名。点「生成流程图」后，终稿出现在右侧，画布收回到这里。
              </p>
            )}

            {ioOpen ? (
              <div className="space-y-1 rounded border bg-white p-1.5">
                <Textarea
                  className="min-h-[88px] font-mono text-[10px]"
                  placeholder={"flowchart TD\n  A((原料)) --> B[预处理]\n  B --> C{分离?}"}
                  value={mermaidImport}
                  onChange={(e) => setMermaidImport(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 bg-[#1a5632] text-[10px] hover:bg-[#144228]"
                  onClick={() => {
                    const parsed = mermaidToFlow(mermaidImport);
                    if (parsed.nodes.length === 0) {
                      toast.error("未能解析节点，请检查 Mermaid 语法");
                      return;
                    }
                    setNodes(
                      parsed.nodes.map((n) => ({
                        id: n.id,
                        label: n.label,
                        role: n.role,
                        shape: n.shape,
                      })),
                    );
                    setEdges(parsed.edges);
                    setDirection(parsed.direction);
                    const maxNum = parsed.nodes.reduce((max, n) => {
                      const num = Number.parseInt(n.id, 10);
                      return Number.isNaN(num) ? max : Math.max(max, num);
                    }, 0);
                    setNextId(maxNum + 1);
                    setResult(null);
                    setPreviewMode("canvas");
                    toast.success(`已导入 ${parsed.nodes.length} 个节点`);
                  }}
                >
                  应用到画布
                </Button>
              </div>
            ) : null}

            {!showCanvasLeft ? ioButtons : null}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">节点（表单）</Label>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addNode}>
                  <Plus className="mr-0.5 h-3 w-3" />添加
                </Button>
              </div>
              <details className="rounded border bg-white px-1.5 py-1">
                <summary className="cursor-pointer text-[9px] text-[#6b7c72]">展开列表细调</summary>
                <div className="mt-1">
                  {nodes.map((n) => (
                    <div key={n.id} className="mb-1 flex gap-1">
                      <Input
                        className="h-7 flex-1 text-[10px]"
                        placeholder="节点名称"
                        value={n.label}
                        onChange={(e) => updateNode(n.id, { label: e.target.value })}
                      />
                      <select
                        className="h-7 w-16 rounded border bg-background text-[10px]"
                        value={n.role || "process"}
                        onChange={(e) => {
                          const role = e.target.value as FlowNode["role"];
                          const shape =
                            role === "decision" ? "diamond" : role === "start_end" ? "oval" : "box";
                          updateNode(n.id, { role, shape });
                        }}
                      >
                        <option value="process">过程</option>
                        <option value="decision">判断</option>
                        <option value="start_end">起止</option>
                        <option value="callout">标注</option>
                      </select>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeNode(n.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">连线（表单）</Label>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addEdge}>
                  <Plus className="mr-0.5 h-3 w-3" />添加
                </Button>
              </div>
              <details className="rounded border bg-white px-1.5 py-1">
                <summary className="cursor-pointer text-[9px] text-[#6b7c72]">展开列表细调</summary>
                <div className="mt-1">
                  {edges.map((e, i) => (
                    <div key={i} className="mb-1 flex flex-wrap items-center gap-1">
                      <select
                        className="h-7 min-w-0 flex-1 rounded border bg-background text-[10px]"
                        value={e.from}
                        onChange={(e2) => updateEdge(i, "from", e2.target.value)}
                      >
                        <option value="">起点</option>
                        {nodes
                          .filter((n) => n.label.trim())
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.label}
                            </option>
                          ))}
                      </select>
                      <span className="text-[10px] text-muted-foreground">→</span>
                      <select
                        className="h-7 min-w-0 flex-1 rounded border bg-background text-[10px]"
                        value={e.to}
                        onChange={(e2) => updateEdge(i, "to", e2.target.value)}
                      >
                        <option value="">终点</option>
                        {nodes
                          .filter((n) => n.label.trim())
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.label}
                            </option>
                          ))}
                      </select>
                      <Input
                        className="h-7 w-20 text-[10px]"
                        placeholder="标签"
                        value={e.label || ""}
                        onChange={(e2) => updateEdge(i, "label", e2.target.value)}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeEdge(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle={showCanvasRight ? "结构画布" : "期刊终稿预览"}
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={() => void handleRun()}
          generateLabel="生成流程图"
          regenerateLabel="重新生成终稿"
          readyHint="右侧编排完成后，点此生成 Graphviz 期刊图"
          emptyHint="在右侧画布添加节点并连线，再生成。"
          imageSrc={showCanvasRight ? null : result?.imageBase64}
          imageAlt={`流程图 — ${title}`}
          footer={
            result ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={showCanvasRight ? "default" : "outline"}
                  size="sm"
                  className={`h-8 text-xs ${showCanvasRight ? "bg-[#1a5632] hover:bg-[#144228]" : ""}`}
                  onClick={() => setPreviewMode(showCanvasRight ? "result" : "canvas")}
                >
                  {showCanvasRight ? "查看终稿" : "编辑画布"}
                </Button>
                <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.download = `${title || "flow"}.png`;
                    a.href = result.imageBase64;
                    a.click();
                  }}
                >
                  PNG
                </Button>
                {result.svgUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => downloadUrl(result.svgUrl!, `${title || "flow"}.svg`)}
                  >
                    <Download className="h-3 w-3" /> SVG
                  </Button>
                ) : null}
                {result.pdfUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => downloadUrl(result.pdfUrl!, `${title || "flow"}.pdf`)}
                  >
                    <Download className="h-3 w-3" /> PDF
                  </Button>
                ) : null}
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
        >
          {showCanvasRight ? (
            <div className="flex h-full min-h-[480px] flex-col gap-2">
              <p className="text-[11px] text-[#6b7c72]">
                大画布编排（预览结构，非终稿）。生成后右侧换成期刊 PNG，画布移到左侧。
              </p>
              {canvasBlock({ roomy: true })}
            </div>
          ) : null}
        </PlotPreviewPane>
      }
    />
  );
}
