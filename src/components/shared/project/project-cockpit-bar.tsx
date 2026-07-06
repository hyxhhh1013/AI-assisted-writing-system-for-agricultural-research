"use client";

import { cn } from "@/lib/utils";
import {
  PAPER_PHASE_LABELS,
  parsePaperPassport,
  type PaperPhase,
  type PhaseStatus,
} from "@/contracts/paper-passport";
import { getNextPhaseHint } from "@/lib/paper-passport-progress";
import {
  getPhaseNavigationAction,
  isPhaseNavigable,
  type CockpitNavigationAction,
} from "@/lib/paper-passport-navigation";

interface ProjectCockpitBarProps {
  paperPassportRaw?: string | null;
  className?: string;
  onNavigate?: (action: CockpitNavigationAction) => void;
}

const STATUS_STYLE: Record<PhaseStatus, string> = {
  done: "bg-[#1a5632] text-white border-[#1a5632]",
  in_progress: "bg-[#2563eb] text-white border-[#2563eb]",
  ready: "bg-white text-[#1a5632] border-[#1a5632]/40",
  locked: "bg-[#f3f4f6] text-[#9aa8a0] border-transparent",
};

function phaseKey(index: number): `${PaperPhase}` {
  return String(index) as `${PaperPhase}`;
}

export function ProjectCockpitBar({
  paperPassportRaw,
  className,
  onNavigate,
}: ProjectCockpitBarProps) {
  const passport = parsePaperPassport(paperPassportRaw ?? null);
  if (!passport) return null;

  const hint = getNextPhaseHint(passport);
  const currentPhase = passport.currentPhase;
  const currentStatus = passport.phaseStatus[phaseKey(currentPhase)] ?? "locked";
  const currentLabel = PAPER_PHASE_LABELS[currentPhase] ?? "";

  const handlePhaseClick = (index: PaperPhase) => {
    if (!onNavigate) return;
    const status = passport.phaseStatus[phaseKey(index)] ?? "locked";
    if (!isPhaseNavigable(index, status)) return;
    const action = getPhaseNavigationAction(index);
    if (action) onNavigate(action);
  };

  const handleGoToCurrent = () => {
    if (!onNavigate || currentStatus === "done") return;
    const action = getPhaseNavigationAction(currentPhase);
    if (action) onNavigate(action);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-[#1a5632]/10 bg-[#f6f5f1]/50 px-2 py-1.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] font-medium text-[#6b7c72]">论文阶段</span>
        {PAPER_PHASE_LABELS.map((label, index) => {
          const key = phaseKey(index);
          const status = passport.phaseStatus[key] ?? "locked";
          const isCurrent = passport.currentPhase === index;
          const navigable = Boolean(onNavigate) && isPhaseNavigable(index as PaperPhase, status);
          const Tag = navigable ? "button" : "span";

          return (
            <Tag
              key={key}
              type={navigable ? "button" : undefined}
              title={`Phase ${index} ${label} — ${status}`}
              onClick={navigable ? () => handlePhaseClick(index as PaperPhase) : undefined}
              className={cn(
                "inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded border px-1 text-[9px] font-medium",
                STATUS_STYLE[status],
                isCurrent && "ring-1 ring-[#1a5632]/30",
                navigable && "cursor-pointer hover:opacity-90",
              )}
            >
              {index}
            </Tag>
          );
        })}
        {passport.source?.directionSlug && (
          <span className="ml-auto truncate text-[10px] text-[#9aa8a0]">
            来自方向 · {passport.source.directionSlug}
          </span>
        )}
      </div>

      {hint && currentStatus !== "done" && (
        <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-[#1a5632]/10 pt-1.5">
          <span className="text-[10px] text-[#6b7c72]">
            <span className="font-medium text-[#1a5632]">{currentLabel}</span>
            {" · "}
            {hint}
          </span>
          {onNavigate && (
            <button
              type="button"
              onClick={handleGoToCurrent}
              className="rounded border border-[#1a5632]/20 bg-white px-2 py-0.5 text-[10px] font-medium text-[#1a5632] hover:bg-[#1a5632]/5"
            >
              前往
            </button>
          )}
        </div>
      )}
    </div>
  );
}
