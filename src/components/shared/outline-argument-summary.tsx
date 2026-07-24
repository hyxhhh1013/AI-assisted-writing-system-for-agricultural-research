"use client";

import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArgumentBlueprint } from "@/contracts/argument-blueprint";

interface OutlineArgumentSummaryProps {
  blueprint: ArgumentBlueprint | null;
  isGenerating: boolean;
  hasOutline: boolean;
  onGenerate: () => void;
}

export function OutlineArgumentSummary({
  blueprint,
  isGenerating,
  hasOutline,
  onGenerate,
}: OutlineArgumentSummaryProps) {
  if (!hasOutline) return null;

  return (
    <div className="shrink-0 mx-2 mt-1 mb-1 rounded-lg border border-[#1a5632]/15 bg-[#1a5632]/[0.03] p-2.5 space-y-2">
      {blueprint ? (
        <>
          <div className="flex items-start gap-2">
            <GitBranch className="h-3.5 w-3.5 text-[#1a5632] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] font-medium text-[#1a5632]">论证蓝图 · Phase 3</p>
              <p className="text-[11px] font-medium text-foreground leading-snug line-clamp-2">
                {blueprint.centralThesis}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {blueprint.chains.length} 条主张链 · {blueprint.rebuttals.length} 条反驳
                {blueprint.gaps.length > 0 ? ` · ${blueprint.gaps.length} 个证据缺口` : ""}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs"
            disabled={isGenerating}
            onClick={onGenerate}
          >
            {isGenerating ? "生成中…" : "重新生成论证蓝图"}
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            论证蓝图：理清「主张—证据—推理」与预期反驳，再去扩写正文。
          </p>
          <Button
            type="button"
            size="sm"
            className="h-7 w-full text-xs"
            disabled={isGenerating}
            onClick={onGenerate}
          >
            {isGenerating ? "生成中…" : "生成论证蓝图"}
          </Button>
        </div>
      )}
    </div>
  );
}
