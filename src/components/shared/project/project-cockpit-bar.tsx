"use client";

import { cn } from "@/lib/utils";
import {
  PAPER_PHASE_LABELS,
  parsePaperPassport,
  type PhaseStatus,
} from "@/contracts/paper-passport";

interface ProjectCockpitBarProps {
  paperPassportRaw?: string | null;
  className?: string;
}

const STATUS_STYLE: Record<PhaseStatus, string> = {
  done: "bg-[#1a5632] text-white border-[#1a5632]",
  in_progress: "bg-[#2563eb] text-white border-[#2563eb]",
  ready: "bg-white text-[#1a5632] border-[#1a5632]/40",
  locked: "bg-[#f3f4f6] text-[#9aa8a0] border-transparent",
};

export function ProjectCockpitBar({ paperPassportRaw, className }: ProjectCockpitBarProps) {
  const passport = parsePaperPassport(paperPassportRaw ?? null);
  if (!passport) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border border-[#1a5632]/10 bg-[#f6f5f1]/50 px-2 py-1.5",
        className,
      )}
    >
      <span className="mr-1 text-[10px] font-medium text-[#6b7c72]">论文阶段</span>
      {PAPER_PHASE_LABELS.map((label, index) => {
        const key = String(index) as "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
        const status = passport.phaseStatus[key] ?? "locked";
        const isCurrent = passport.currentPhase === index;
        return (
          <span
            key={key}
            title={`Phase ${index} ${label} — ${status}`}
            className={cn(
              "inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded border px-1 text-[9px] font-medium",
              STATUS_STYLE[status],
              isCurrent && "ring-1 ring-[#1a5632]/30",
            )}
          >
            {index}
          </span>
        );
      })}
      {passport.source?.directionSlug && (
        <span className="ml-auto truncate text-[10px] text-[#9aa8a0]">
          来自方向 · {passport.source.directionSlug}
        </span>
      )}
    </div>
  );
}
