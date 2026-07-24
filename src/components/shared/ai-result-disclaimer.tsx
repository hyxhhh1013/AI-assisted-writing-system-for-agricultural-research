"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** ENG-PR-085：AI 分析结果固定免责文案 */
export const AI_RESULT_DISCLAIMER =
  "以下内容由 AI 根据上传数据或文献自动生成，仅供参考；请核对原始数据与文献后再写入论文。";

export function AiResultDisclaimer({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 text-amber-950/80 dark:text-amber-100/90",
        compact ? "px-2.5 py-1.5 text-[10px] leading-relaxed" : "px-3 py-2 text-[11px] leading-relaxed",
        className,
      )}
    >
      <AlertTriangle
        className={cn("shrink-0 text-amber-600/80", compact ? "mt-0.5 h-3 w-3" : "mt-0.5 h-3.5 w-3.5")}
        aria-hidden
      />
      <p>{AI_RESULT_DISCLAIMER}</p>
    </div>
  );
}
