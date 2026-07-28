"use client";

/**
 * Mermaid 机理图 — /plot 示意图入口（从 XRD MechanismCard 迁入统一工作区）。
 * XRD 侧仍可复用同文件导出的兼容包装。
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { saveChartImage } from "@/services/mol-diagram";
import { getErrorMessage } from "@/lib/error-utils";
import { buildPlotInsertReplay, type PlotToolPrefill } from "@/contracts/figure";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";

const DEFAULT_DIAGRAM = `graph TD
    A[生物炭] --> B{土壤改良}
    B -->|盐分| C[降低盐分]
    B -->|有机质| D[增加有机质]
    B -->|结构| E[改善结构]
    C --> F[作物增产]
    D --> F
    E --> F`;

interface MermaidMechanismCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

export function MermaidMechanismCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  prefill,
}: MermaidMechanismCardProps) {
  const [mermaidDef, setMermaidDef] = useState(DEFAULT_DIAGRAM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [liveOk, setLiveOk] = useState(false);
  const previewSvgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prefill || prefill.figureId !== "mechanism") return;
    const raw = prefill.config.mermaid;
    if (typeof raw === "string" && raw.trim()) {
      setMermaidDef(raw);
      setResult(null);
    }
  }, [prefill]);

  useEffect(() => {
    if (!previewSvgRef.current) return;
    setError("");
    setLiveOk(false);
    const renderMermaid = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          fontFamily: "Arial, sans-serif",
          flowchart: { curve: "basis", htmlLabels: true },
        });
        const id = `mech-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidDef);
        if (previewSvgRef.current) {
          previewSvgRef.current.innerHTML = svg;
          setLiveOk(true);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? getErrorMessage(err) : "渲染错误");
        setLiveOk(false);
      }
    };
    const timer = setTimeout(() => void renderMermaid(), 280);
    return () => clearTimeout(timer);
  }, [mermaidDef]);

  const handleGenerate = async () => {
    if (!previewSvgRef.current || !liveOk) {
      toast.error("请先修正 Mermaid 语法");
      return;
    }
    setLoading(true);
    try {
      const svgEl = previewSvgRef.current.querySelector("svg");
      if (!svgEl) throw new Error("SVG 未渲染");

      const svgClone = svgEl.cloneNode(true) as SVGElement;
      const bbox = svgEl.getBoundingClientRect();
      svgClone.setAttribute("width", String(Math.max(bbox.width, 600)));
      svgClone.setAttribute("height", String(Math.max(bbox.height, 400)));

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("图片加载失败"));
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
      });

      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(img.width, 1) * scale;
      canvas.height = Math.max(img.height, 1) * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 初始化失败");
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const pngBase64 = canvas.toDataURL("image/png");
      const json = await saveChartImage(pngBase64);
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl });
      toast.success("机理图生成成功");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlotWorkspace
      title={toolTitle ?? "Mermaid 机理图"}
      description={description ?? "用 Mermaid 语法快速草绘概念机理，导出高清 PNG 插入论文"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <details className="rounded bg-[#faf9f6] p-2 text-[10px] leading-relaxed text-[#6b7c72]">
              <summary className="cursor-pointer font-medium">语法提示</summary>
              <p className="mt-1">
                graph TD; A[过程] → B&#123;判断&#125;; B →|是| C[路径A]。左侧编辑实时预览，右侧生成投稿用 PNG。
              </p>
            </details>
            <div>
              <Label className="text-xs">Mermaid 定义</Label>
              <Textarea
                className="mt-0.5 h-48 font-mono text-[10px]"
                value={mermaidDef}
                onChange={(e) => setMermaidDef(e.target.value)}
              />
            </div>
            <div className="min-h-[100px] overflow-x-auto rounded-md border bg-white p-2">
              <div ref={previewSvgRef} className="max-w-full" />
              {error ? <p className="text-[10px] text-red-500">{error}</p> : null}
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="机理图预览"
          loading={loading}
          canGenerate={liveOk && !error}
          onGenerate={() => void handleGenerate()}
          generateLabel="导出高清 PNG"
          imageSrc={result?.imageBase64}
          imageAlt="机理图"
          emptyHint="左侧编辑 Mermaid，语法正确后可导出。"
          footer={
            result ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                <Button
                  size="sm"
                  className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                  onClick={() =>
                    onInsertToPaper(
                      result.imageUrl,
                      "概念机理图",
                      buildPlotInsertReplay("mechanism", "概念机理图", {
                        mermaid: mermaidDef,
                      }),
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
