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
  ready: "bg-white text-[#1a5632] border-[#1a5632]/50",
  locked: "bg-[#eceff1] text-[#9aa8a0] border-[#dfe5e1]",
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
        "rounded-lg border border-[#1a5632]/25 bg-[#eef5f0] px-3 py-2 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold text-[#1a5632]">论文阶段 Cockpit</span>
        <span className="text-[10px] text-[#6b7c72]">
          当前：P{currentPhase} {currentLabel}
        </span>
        {passport.source?.directionSlug && (
          <span className="ml-auto truncate text-[10px] text-[#9aa8a0]">
            来自方向 · {passport.source.directionSlug}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-1">
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
              title={`P${index} ${label} — ${status}${navigable ? "（点击跳转）" : ""}`}
              onClick={navigable ? () => handlePhaseClick(index as PaperPhase) : undefined}
              className={cn(
                "inline-flex min-w-[2.5rem] flex-col items-center rounded-md border px-1 py-0.5",
                STATUS_STYLE[status],
                isCurrent && "ring-2 ring-[#1a5632]/35 ring-offset-1",
                navigable && "cursor-pointer hover:brightness-95",
              )}
            >
              <span className="text-[10px] font-bold leading-none">{index}</span>
              <span className="mt-0.5 max-w-[3rem] truncate text-[8px] leading-none">{label}</span>
            </Tag>
          );
        })}
      </div>

      {hint && currentStatus !== "done" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#1a5632]/15 pt-2">
          <span className="text-[11px] text-[#3d4f45]">
            下一步 · <span className="font-medium text-[#1a5632]">{hint}</span>
          </span>
          {onNavigate && (
            <button
              type="button"
              onClick={handleGoToCurrent}
              className="rounded-md border border-[#1a5632]/30 bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a5632] shadow-sm hover:bg-[#1a5632]/5"
            >
              前往此阶段
            </button>
          )}
        </div>
      )}
    </div>
  );
}
