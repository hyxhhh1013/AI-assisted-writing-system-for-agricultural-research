"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon, Loader2, Sparkles } from "lucide-react";

interface PlotPreviewPaneProps {
  paneTitle?: string;
  loading: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  generateLabel?: string;
  regenerateLabel?: string;
  readyHint?: string;
  emptyTitle?: string;
  emptyHint?: string;
  imageSrc?: string | null;
  imageAlt?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

export function PlotPreviewPane({
  paneTitle = "预览",
  loading,
  canGenerate,
  onGenerate,
  generateLabel = "生成",
  regenerateLabel = "重新生成",
  readyHint,
  emptyTitle = "等待输入",
  emptyHint = "在左侧完成配置后，点击上方按钮生成。",
  imageSrc,
  imageAlt = "preview",
  children,
  footer,
}: PlotPreviewPaneProps) {
  const hasResult = Boolean(imageSrc || children);
  const statusHint = loading
    ? "正在处理，请稍候…"
    : hasResult
      ? "可调整左侧参数后重新生成"
      : canGenerate
        ? (readyHint ?? "参数已就绪，点击上方按钮生成")
        : emptyHint;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eef1ee]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#1a5632]/10 bg-white/90 px-5 py-3 backdrop-blur-sm">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#122820]">{paneTitle}</p>
          <p className="truncate text-xs text-[#6b7c72]">{statusHint}</p>
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
          {loading ? "处理中…" : hasResult ? regenerateLabel : generateLabel}
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col p-5">
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto rounded-2xl border border-dashed border-[#1a5632]/20 bg-white/70 shadow-inner"
          style={{
            backgroundImage:
              "linear-gradient(#1a563208 1px, transparent 1px), linear-gradient(90deg, #1a563208 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-[#6b7c72]">
              <Loader2 className="h-10 w-10 animate-spin text-[#1a5632]" />
              <p className="text-sm">正在生成…</p>
            </div>
          ) : children ? (
            <div className="h-full w-full overflow-auto p-4">{children}</div>
          ) : imageSrc ? (
            <div className="flex h-full w-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt={imageAlt}
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
                {canGenerate ? "可以生成了" : emptyTitle}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#6b7c72]">{emptyHint}</p>
            </div>
          )}
        </div>
      </div>

      {footer && !loading && (
        <div className="shrink-0 border-t border-[#1a5632]/10 bg-white/95 px-5 py-3 backdrop-blur-sm">
          {footer}
        </div>
      )}
    </div>
  );
}
