"use client";

import { ImageIcon, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";

interface OutlineBlueprintSummaryProps {
  blueprint: WritingBlueprint | null;
  isGenerating: boolean;
  isStale: boolean;
  hasOutline: boolean;
  onGenerate: () => void;
  onOpenDetail: () => void;
}

export function OutlineBlueprintSummary({
  blueprint,
  isGenerating,
  isStale,
  hasOutline,
  onGenerate,
  onOpenDetail,
}: OutlineBlueprintSummaryProps) {
  if (!hasOutline) return null;

  return (
    <div className="shrink-0 mx-2 mt-2 mb-1 rounded-lg border border-primary/15 bg-primary/[0.04] p-2.5 space-y-2">
      {blueprint ? (
        <>
          {isStale && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/80 rounded px-2 py-1 leading-relaxed">
              大纲已修改，蓝图可能过期。请刷新蓝图后再扩写。
            </p>
          )}
          <div className="flex items-start gap-2">
            <Map className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] font-medium text-foreground leading-snug line-clamp-2">
                {blueprint.thesis}
              </p>
              <p className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                <span>
                  约 {blueprint.estimatedWordCount.min.toLocaleString()}–
                  {blueprint.estimatedWordCount.max.toLocaleString()} 字
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <ImageIcon className="h-3 w-3" />
                  {blueprint.figurePlan.totalMin}–{blueprint.figurePlan.totalMax} 张图
                  {blueprint.figurePlan.items.length > 0 &&
                    `（已规划 ${blueprint.figurePlan.items.length} 项）`}
                </span>
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[10px] flex-1"
              onClick={onOpenDetail}
            >
              查看蓝图
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isStale ? "default" : "ghost"}
              className="h-6 text-[10px] px-2"
              disabled={isGenerating}
              onClick={onGenerate}
            >
              {isStale ? "刷新蓝图" : "刷新"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            生成写作蓝图：把握全文逻辑、配图位置与数量，再开始扩写。
          </p>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs w-full"
            disabled={isGenerating}
            onClick={onGenerate}
          >
            {isGenerating ? "生成中…" : "生成写作蓝图"}
          </Button>
        </>
      )}
    </div>
  );
}
