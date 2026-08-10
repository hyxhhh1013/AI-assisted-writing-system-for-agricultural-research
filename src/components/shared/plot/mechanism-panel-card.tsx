"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  renderMechanismPanel,
  type MechanismPanelBlock,
  type MechanismPanelColumn,
  type MechanismPanelConfig,
} from "@/services/mechanism-panel";
import { getErrorMessage } from "@/lib/error-utils";
import { buildPlotInsertReplay } from "@/contracts/figure";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import { FlowSubgraphEditor } from "@/components/shared/plot/flow-subgraph-editor";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";
import type { FlowEdge, FlowNode } from "@/services/mol-diagram";

type Preset = "nature" | "agr_journal" | "print_bw";

const ABC_TEMPLATE: MechanismPanelColumn[] = [
  {
    id: "a",
    title: "Feedstock composition",
    footnote: "Key components released during conversion.",
    blocks: [
      { type: "text", content: "Describe lignocellulosic fractions and minerals." },
      { type: "image", assetKey: "panel_a_img", caption: "Upload 3D / photo asset" },
      {
        type: "callout",
        content: "Cellulose / hemicellulose / lignin / minerals",
      },
    ],
  },
  {
    id: "b",
    title: "Catalyst design space",
    footnote: "Dual functionality = metal + support.",
    blocks: [
      { type: "text", content: "Two supports × selected transition metals." },
      { type: "image", assetKey: "panel_b_img", caption: "Upload support / metal assets" },
      {
        type: "callout",
        content: "Not assuming mixed synergy unless evidenced.",
      },
    ],
  },
  {
    id: "c",
    title: "Two target-product pathways",
    footnote: "Goal: directed deconstruction rather than maximizing one phase.",
    blocks: [
      {
        type: "flow_subgraph",
        direction: "vertical",
        nodes: [
          { id: "1", label: "M/BC", role: "start_end" },
          { id: "2", label: "M/Z5", role: "start_end" },
          { id: "3", label: "C5–C11", role: "process", color: "#8BCF8B" },
          { id: "4", label: "Deoxygenation", role: "process", color: "#42949E" },
          { id: "5", label: "Phenolics", role: "process", color: "#E67E22" },
          { id: "6", label: "Aromatics", role: "process", color: "#D35400" },
          { id: "7", label: "CO-rich gas", role: "start_end" },
          { id: "8", label: "Light gases", role: "start_end" },
        ],
        edges: [
          { from: "1", to: "3" },
          { from: "2", to: "4" },
          { from: "3", to: "5" },
          { from: "4", to: "6" },
          { from: "5", to: "7" },
          { from: "6", to: "8" },
        ],
      },
    ],
  },
];

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function MechanismPanelCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  prefill,
}: PlotToolProps & { prefill?: import("@/contracts/figure").PlotToolPrefill | null }) {
  const [title, setTitle] = useState("Graphical abstract");
  const [preset, setPreset] = useState<Preset>("nature");
  const [panels, setPanels] = useState<MechanismPanelColumn[]>(
    ABC_TEMPLATE.map((p) => ({
      ...p,
      blocks: p.blocks.map((b) => ({ ...b })),
    })),
  );
  const [activePanel, setActivePanel] = useState(0);
  const [assets, setAssets] = useState<Record<string, File>>({});
  const imgKeySeq = useRef(0);
  const [loading, setLoading] = useState(false);
  const [dragBlockIdx, setDragBlockIdx] = useState<number | null>(null);
  const [result, setResult] = useState<{
    imageBase64: string;
    imageUrl: string;
    svgUrl?: string;
    pdfUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (!prefill || prefill.figureId !== "mechanism_panel") return;
    const cfg = prefill.config;
    if (typeof cfg.title === "string") setTitle(cfg.title);
    if (cfg.preset === "nature" || cfg.preset === "agr_journal" || cfg.preset === "print_bw") {
      setPreset(cfg.preset);
    }
    if (Array.isArray(cfg.panels)) {
      setPanels(cfg.panels as MechanismPanelColumn[]);
      setActivePanel(0);
    }
    setResult(null);
  }, [prefill]);

  const current = panels[activePanel];

  const configPreview = useMemo(
    () =>
      JSON.stringify(
        {
          title,
          preset,
          panels: panels.map((p) => ({
            id: p.id,
            title: p.title,
            blocks: p.blocks.map((b) => b.type),
          })),
        },
        null,
        2,
      ),
    [title, preset, panels],
  );

  const updatePanel = (idx: number, patch: Partial<MechanismPanelColumn>) => {
    setPanels((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const updateBlock = (bIdx: number, patch: Partial<MechanismPanelBlock>) => {
    setPanels((prev) =>
      prev.map((p, i) => {
        if (i !== activePanel) return p;
        const blocks = p.blocks.map((b, j) => (j === bIdx ? { ...b, ...patch } : b));
        return { ...p, blocks };
      }),
    );
  };

  const addBlock = (type: MechanismPanelBlock["type"]) => {
    const block: MechanismPanelBlock =
      type === "callout"
        ? { type, content: "Key claim" }
        : type === "text"
          ? { type, content: "Annotation" }
          : type === "image"
            ? {
                type,
                assetKey: `panel_${current?.id || "x"}_img_${++imgKeySeq.current}`,
                caption: "",
              }
            : type === "molecule"
              ? { type, label: "Molecule", smiles: "" }
              : {
                  type: "flow_subgraph",
                  nodes: [
                    { id: "1", label: "A", role: "start_end" },
                    { id: "2", label: "B", role: "process" },
                  ],
                  edges: [{ from: "1", to: "2" }],
                };
    updatePanel(activePanel, { blocks: [...(current?.blocks || []), block] });
  };

  const removeBlock = (bIdx: number) => {
    updatePanel(activePanel, {
      blocks: (current?.blocks || []).filter((_, i) => i !== bIdx),
    });
  };

  const reorderBlocks = (from: number, to: number) => {
    if (!current || from === to || from < 0 || to < 0) return;
    const blocks = [...current.blocks];
    const [moved] = blocks.splice(from, 1);
    if (!moved) return;
    blocks.splice(to, 0, moved);
    updatePanel(activePanel, { blocks });
  };

  const loadAbcTemplate = () => {
    setPanels(
      ABC_TEMPLATE.map((p) => ({
        ...p,
        blocks: p.blocks.map((b) => ({ ...b })),
      })),
    );
    setActivePanel(0);
    setResult(null);
  };

  const handleRun = async () => {
    setLoading(true);
    try {
      const config: MechanismPanelConfig = {
        title,
        preset,
        panels,
        dpi: preset === "print_bw" ? 600 : 300,
      };
      const usedAssets: Record<string, File> = {};
      for (const p of panels) {
        for (const b of p.blocks) {
          if (b.type === "image" && b.assetKey && assets[b.assetKey]) {
            usedAssets[b.assetKey] = assets[b.assetKey]!;
          }
        }
      }
      const json = await renderMechanismPanel(
        config,
        Object.keys(usedAssets).length ? usedAssets : undefined,
      );
      setResult(json);
      toast.success("多面板机理图已生成");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlotWorkspace
      title={toolTitle ?? "多面板机理图"}
      description={
        description ??
        "Nature 风格 a/b/c 合成：文字/素材图/流程子图/标注；3D 写实图请上传后排版"
      }
      configSize="wide"
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3 sm:px-5">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={loadAbcTemplate}>
                三栏模板 (a/b/c)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => {
                  setPanels([
                    {
                      id: "a",
                      title: "Pathway",
                      blocks: [
                        {
                          type: "flow_subgraph",
                          nodes: [
                            { id: "1", label: "Start", role: "start_end" },
                            { id: "2", label: "Step", role: "process" },
                            { id: "3", label: "End", role: "start_end" },
                          ],
                          edges: [
                            { from: "1", to: "2" },
                            { from: "2", to: "3" },
                          ],
                        },
                      ],
                    },
                  ]);
                  setActivePanel(0);
                }}
              >
                单栏流程
              </Button>
            </div>
            <div>
              <Label className="text-xs">总标题</Label>
              <Input className="mt-0.5 h-8 text-xs" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">期刊预设</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
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
            <div className="flex flex-wrap gap-1">
              {panels.map((p, i) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={i === activePanel ? "default" : "outline"}
                  className={`h-7 text-[10px] ${i === activePanel ? "bg-[#1a5632] hover:bg-[#144228]" : ""}`}
                  onClick={() => setActivePanel(i)}
                >
                  ({p.id})
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px]"
                onClick={() => {
                  const id = String.fromCharCode(97 + panels.length);
                  setPanels([
                    ...panels,
                    { id, title: `Panel ${id}`, blocks: [{ type: "text", content: "" }] },
                  ]);
                  setActivePanel(panels.length);
                }}
              >
                <Plus className="h-3 w-3" /> 栏
              </Button>
            </div>

            {current ? (
              <div className="space-y-2 rounded-md border border-[#1a5632]/15 bg-[#faf9f6] p-2">
                <div className="flex gap-2">
                  <div className="w-14">
                    <Label className="text-[10px]">编号</Label>
                    <Input
                      className="mt-0.5 h-7 text-[10px]"
                      value={current.id}
                      onChange={(e) => updatePanel(activePanel, { id: e.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-[10px]">栏标题</Label>
                    <Input
                      className="mt-0.5 h-7 text-[10px]"
                      value={current.title}
                      onChange={(e) => updatePanel(activePanel, { title: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">脚注</Label>
                  <Input
                    className="mt-0.5 h-7 text-[10px]"
                    value={current.footnote || ""}
                    onChange={(e) => updatePanel(activePanel, { footnote: e.target.value })}
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  {(["text", "image", "flow_subgraph", "callout", "molecule"] as const).map((t) => (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      className="h-6 text-[9px]"
                      onClick={() => addBlock(t)}
                    >
                      +{t}
                    </Button>
                  ))}
                </div>

                {/* 轻量块画布：拖拽排序 */}
                <div className="space-y-1">
                  {current.blocks.map((b, bIdx) => (
                    <div
                      key={bIdx}
                      className={`rounded border bg-white p-1.5 ${dragBlockIdx === bIdx ? "ring-1 ring-[#1a5632]" : ""}`}
                      draggable
                      onDragStart={() => setDragBlockIdx(bIdx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragBlockIdx !== null) reorderBlocks(dragBlockIdx, bIdx);
                        setDragBlockIdx(null);
                      }}
                    >
                      <div className="mb-1 flex items-center gap-1">
                        <GripVertical className="h-3 w-3 text-[#6b7c72]" />
                        <span className="text-[10px] font-medium text-[#122820]">{b.type}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-auto h-5 w-5"
                          onClick={() => removeBlock(bIdx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {(b.type === "text" || b.type === "callout") && (
                        <Textarea
                          className="h-14 text-[10px]"
                          value={b.content || ""}
                          onChange={(e) => updateBlock(bIdx, { content: e.target.value })}
                        />
                      )}
                      {b.type === "image" && (
                        <div className="space-y-1">
                          <Input
                            type="file"
                            accept="image/*"
                            className="h-7 text-[10px]"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              const key = b.assetKey || `img_${bIdx}`;
                              updateBlock(bIdx, { assetKey: key });
                              if (file) setAssets((prev) => ({ ...prev, [key]: file }));
                            }}
                          />
                          <Input
                            className="h-7 text-[10px]"
                            placeholder="图注"
                            value={b.caption || ""}
                            onChange={(e) => updateBlock(bIdx, { caption: e.target.value })}
                          />
                          {b.assetKey && assets[b.assetKey] ? (
                            <p className="text-[9px] text-[#6b7c72]">{assets[b.assetKey]!.name}</p>
                          ) : (
                            <p className="text-[9px] text-[#6b7c72]">未上传（将显示占位）</p>
                          )}
                        </div>
                      )}
                      {b.type === "molecule" && (
                        <div className="space-y-1">
                          <Input
                            className="h-7 text-[10px]"
                            placeholder="标签"
                            value={b.label || ""}
                            onChange={(e) => updateBlock(bIdx, { label: e.target.value })}
                          />
                          <Input
                            className="h-7 font-mono text-[10px]"
                            placeholder="SMILES"
                            value={b.smiles || ""}
                            onChange={(e) => updateBlock(bIdx, { smiles: e.target.value })}
                          />
                        </div>
                      )}
                      {b.type === "flow_subgraph" && (
                        <FlowSubgraphEditor
                          compact={false}
                          value={{
                            direction: b.direction || "vertical",
                            nodes: (b.nodes || []).map(
                              (n): FlowNode => ({
                                id: n.id,
                                label: n.label,
                                shape:
                                  n.role === "decision"
                                    ? "diamond"
                                    : n.role === "start_end"
                                      ? "oval"
                                      : "box",
                                role: (n.role as FlowNode["role"]) || "process",
                                color: n.color,
                              }),
                            ),
                            edges: (b.edges || []).map(
                              (e): FlowEdge => ({
                                from: e.from,
                                to: e.to,
                                label: e.label,
                              }),
                            ),
                          }}
                          onChange={(next) =>
                            updateBlock(bIdx, {
                              direction: next.direction,
                              nodes: next.nodes,
                              edges: next.edges,
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <details className="text-[9px] text-[#6b7c72]">
              <summary className="cursor-pointer">结构预览 JSON</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-white p-2">{configPreview}</pre>
            </details>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="多面板预览"
          loading={loading}
          canGenerate={panels.length > 0}
          onGenerate={() => void handleRun()}
          generateLabel="合成机理图"
          imageSrc={result?.imageBase64}
          imageAlt={title}
          emptyHint="选择三栏模板，上传素材或编辑流程子图后生成。"
          footer={
            result ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.download = `${title || "mechanism"}.png`;
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
                    onClick={() => downloadUrl(result.svgUrl!, `${title || "mechanism"}.svg`)}
                  >
                    <Download className="h-3 w-3" /> SVG
                  </Button>
                ) : null}
                {result.pdfUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => downloadUrl(result.pdfUrl!, `${title || "mechanism"}.pdf`)}
                  >
                    <Download className="h-3 w-3" /> PDF
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                  onClick={() =>
                    onInsertToPaper(
                      result.imageUrl,
                      title || "机理图",
                      buildPlotInsertReplay(
                        "mechanism_panel",
                        title || "机理图",
                        { title, preset, panels },
                        { svgUrl: result.svgUrl, pdfUrl: result.pdfUrl },
                      ),
                    )
                  }
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
