"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, ImageIcon, FileText, Expand } from "lucide-react";
import { toast } from "sonner";
import { saveChartImage } from "@/services/mol-diagram";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface MechanismCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

const DEFAULT_DIAGRAM = `graph TD
    A[生物炭] --> B{土壤改良}
    B --> C[降低盐分]
    B --> D[增加有机质]
    B --> E[改善结构]
    C --> F[作物增产]
    D --> F
    E --> F`;

export function MechanismCard({ onInsertToPaper, onPreview }: MechanismCardProps) {
  const [mermaidDef, setMermaidDef] = useState(DEFAULT_DIAGRAM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string } | null>(null);
  const [error, setError] = useState("");
  const svgRef = useRef<HTMLDivElement>(null);
  const previewSvgRef = useRef<HTMLDivElement>(null);

  // 实时渲染预览
  useEffect(() => {
    if (!previewSvgRef.current) return;
    setError("");
    const renderMermaid = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: "sans-serif" });
        const { svg } = await mermaid.render("preview-mech", mermaidDef);
        if (previewSvgRef.current) {
          previewSvgRef.current.innerHTML = svg;
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? getErrorMessage(err) : "渲染错误");
      }
    };
    const timer = setTimeout(renderMermaid, 300);
    return () => clearTimeout(timer);
  }, [mermaidDef]);

  const handleGenerate = async () => {
    if (!previewSvgRef.current) { toast.error("请先编写机理图"); return; }
    setLoading(true);
    try {
      const svgEl = previewSvgRef.current.querySelector("svg");
      if (!svgEl) throw new Error("SVG 未渲染");

      // 设置 SVG 尺寸
      const svgClone = svgEl.cloneNode(true) as SVGElement;
      const bbox = svgEl.getBoundingClientRect();
      svgClone.setAttribute("width", String(bbox.width || 600));
      svgClone.setAttribute("height", String(bbox.height || 400));

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("图片加载失败"));
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
      });

      // 绘制到 Canvas
      const canvas = document.createElement("canvas");
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 初始化失败");
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const pngBase64 = canvas.toDataURL("image/png");
      const json = await saveChartImage(pngBase64);
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl });
      toast.success("机理图生成成功");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "生成失败");
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><ImageIcon className="h-4 w-4" />概念机理图</CardTitle>
        <CardDescription className="text-xs">Mermaid 语法绘制机理/流程图</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">Mermaid 语法</summary>
          <p className="mt-1">graph TD; A[文字] → B「判断」; B →|标签| C[结果]; 支持流程图、时序图、思维导图。编辑后实时预览。</p>
        </details>
        <div>
          <Label className="text-xs">Mermaid 定义</Label>
          <Textarea className="text-[10px] h-28 mt-0.5 font-mono" value={mermaidDef}
            onChange={e => setMermaidDef(e.target.value)} />
        </div>

        {/* 实时预览 */}
        <div className="border rounded-md bg-white p-2 min-h-[80px] flex items-center justify-center overflow-x-auto">
          <div ref={previewSvgRef} className="max-w-full" />
          {error && <p className="text-[10px] text-red-500">{error}</p>}
        </div>

        <Button className="w-full h-8 text-xs" onClick={handleGenerate} disabled={loading || !!error}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 生成中...</> : <><ImageIcon className="h-3.5 w-3.5 mr-1" /> 生成机理图</>}
        </Button>

        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-white group cursor-pointer max-h-40 overflow-y-auto"
              onClick={() => onPreview({ src: result.imageBase64, caption: "概念机理图" })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="Mechanism" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            <Button variant="default" size="sm" className="w-full h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, "概念机理图")}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
