"use client";

import { Map } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 原「独立论证蓝图」入口。论证已并入写作蓝图各节 claim/evidenceHint，
 * 此处改为引导打开写作蓝图，避免双轨心智。
 */
interface OutlineArgumentSummaryProps {
  hasOutline: boolean;
  hasWritingBlueprint: boolean;
  onOpenWritingBlueprint: () => void;
}

export function OutlineArgumentSummary({
  hasOutline,
  hasWritingBlueprint,
  onOpenWritingBlueprint,
}: OutlineArgumentSummaryProps) {
  if (!hasOutline) return null;

  return (
    <div className="shrink-0 mx-2 mt-1 mb-1 rounded-lg border border-[#1a5632]/15 bg-[#1a5632]/[0.03] p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <Map className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a5632]" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          主张—证据—推理已写在
          <span className="font-medium text-[#1a5632]">写作蓝图</span>
          各节（claim / evidenceHint），无需单独生成论证蓝图。
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={hasWritingBlueprint ? "outline" : "default"}
        className="h-7 w-full text-xs"
        onClick={onOpenWritingBlueprint}
      >
        {hasWritingBlueprint ? "打开写作蓝图（含论证要点）" : "先生成 / 打开写作蓝图"}
      </Button>
    </div>
  );
}
