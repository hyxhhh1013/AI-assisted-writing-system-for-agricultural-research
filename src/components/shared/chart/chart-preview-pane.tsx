"use client";

import { Button } from "@/components/ui/button";
import { BarChart3, Download, FileText, ImageIcon, Loader2, Sparkles } from "lucide-react";
import type { ChartPanelResult } from "@/hooks/use-chart-panel";

interface ChartPreviewPaneProps {
  loading: boolean;
  loadingMessage?: string | null;
  canGenerate: boolean;
  result: ChartPanelResult | null;
  title: string;
  onGenerate: () => void;
  onInsert: (imageUrl: string, caption: string) => void;
  onDownload: (url: string, filename: string) => void;
}

export function ChartPreviewPane({
  loading,
  loadingMessage,
  canGenerate,
  result,
  title,
  onGenerate,
  onInsert,
  onDownload,
}: ChartPreviewPaneProps) {
  const baseName = title || "chart";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eef1ee]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#1a5632]/10 bg-white/90 px-5 py-3 backdrop-blur-sm">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#122820]">图表预览</p>
          <p className="truncate text-xs text-[#6b7c72]">
            {loading
              ? loadingMessage ?? "正在渲染，请稍候…"
              : result
                ? "调整左侧参数后可重新生成"
                : canGenerate
                  ? "数据已就绪，点击上方「生成图表」"
                  : "先在左侧粘贴或上传数据"}
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5 bg-[#1a5632] hover:bg-[#144228]"
          onClick={onGenerate}
          disabled={loading || !canGenerate}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {loading ? "生成中…" : result ? "重新生成" : "生成图表"}
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col p-5">
        <div
          className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-[#1a5632]/20 bg-white/70 shadow-inner"
          style={{
            backgroundImage:
              "linear-gradient(#1a563208 1px, transparent 1px), linear-gradient(90deg, #1a563208 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-[#6b7c72]">
              <Loader2 className="h-10 w-10 animate-spin text-[#1a5632]" />
              <p className="text-sm">{loadingMessage ?? "正在生成图表…"}</p>
            </div>
          ) : result ? (
            <div className="flex h-full w-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.imageBase64}
                alt={result.caption}
                className="max-h-full max-w-full rounded-lg bg-white p-3 shadow-md ring-1 ring-[#1a5632]/10"
                style={{ objectFit: "contain" }}
              />
            </div>
          ) : (
            <div className="flex max-w-md flex-col items-center px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#1a5632]/10">
                <ImageIcon className="h-7 w-7 text-[#1a5632]/35" />
              </div>
              <p className="text-sm font-medium text-[#122820]">
                {canGenerate ? "可以生成了" : "等待数据输入"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#6b7c72]">
                {canGenerate
                  ? "预览将显示在此画布区域，生成后可导出 PNG / SVG / PDF 或插入论文。"
                  : "在左侧「数据」标签页粘贴 CSV/TSV，或上传表格文件。"}
              </p>
            </div>
          )}
        </div>
      </div>

      {result && !loading && (
        <div className="shrink-0 border-t border-[#1a5632]/10 bg-white/95 px-5 py-3 backdrop-blur-sm">
          {result.styleValidation?.checks?.some((c) => c.level === "warn" || c.level === "fail") ? (
            <p className="mb-2 text-[10px] leading-relaxed text-amber-800">
              刊规：
              {result.styleValidation.checks
                .filter((c) => c.level === "warn" || c.level === "fail")
                .map((c) => c.message)
                .join("；")}
            </p>
          ) : result.figWidth ? (
            <p className="mb-2 text-[10px] text-[#6b7c72]">
              {result.preset || "nature"} · {result.columns || 1} 栏 · 宽 {result.figWidth.toFixed(2)} in
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => {
                const a = document.createElement("a");
                a.download = `${baseName}.png`;
                a.href = result.imageBase64;
                a.click();
              }}
            >
              <FileText className="h-3 w-3" /> PNG
            </Button>
            {result.svgUrl && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => onDownload(result.svgUrl!, `${baseName}.svg`)}
              >
                <Download className="h-3 w-3" /> SVG
              </Button>
            )}
            {result.pdfUrl && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => onDownload(result.pdfUrl!, `${baseName}.pdf`)}
              >
                <Download className="h-3 w-3" /> PDF
              </Button>
            )}
            {result.csvUrl && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => onDownload(result.csvUrl!, `${baseName}.csv`)}
              >
                <Download className="h-3 w-3" /> CSV
              </Button>
            )}
            {result.manifestUrl && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => onDownload(result.manifestUrl!, `${baseName}.json`)}
              >
                <Download className="h-3 w-3" /> 清单
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 text-xs gap-1 bg-[#1a5632] hover:bg-[#144228]"
              onClick={() => onInsert(result.imageUrl, result.caption)}
            >
              <BarChart3 className="h-3 w-3" /> 插入论文
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
