"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_PROGRESS } from "@/components/shared/plagiarism/constants";
import type { PlagiarismStage } from "@/hooks/use-plagiarism-check";

interface QualityCheckProgressProps {
  checking: boolean;
  stage: PlagiarismStage | null;
  className?: string;
}

export function QualityCheckProgress({ checking, stage, className }: QualityCheckProgressProps) {
  if (!checking || !stage) return null;
  const pct = STAGE_PROGRESS[stage.stage] ?? 40;

  return (
    <div className={cn("rounded-xl border border-[#1a5632]/15 bg-[#1a5632]/5 px-3 py-2.5", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-[#1a5632]">{stage.label}</span>
        <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-[#1a5632]">
          {pct}%
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1a5632]/10">
        <div
          className="h-full rounded-full bg-[#1a5632] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
