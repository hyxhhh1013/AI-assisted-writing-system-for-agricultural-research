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
  getPrimaryTabForPhase,
  isPhaseNavigable,
  isTabAlignedWithPhase,
  PHASE_TAB_LABELS,
  type CockpitNavigationAction,
} from "@/lib/paper-passport-navigation";

interface ProjectCockpitSidebarProps {
  paperPassportRaw?: string | null;
  activeTab: string;
  className?: string;
  onNavigate?: (action: CockpitNavigationAction) => void;
}

const STATUS_DOT: Record<PhaseStatus, string> = {
  done: "bg-[#1a5632]",
  in_progress: "bg-[#2563eb]",
  ready: "bg-[#1a5632]/30 ring-1 ring-[#1a5632]/50",
  locked: "bg-[#dfe5e1]",
};

function phaseKey(index: number): `${PaperPhase}` {
  return String(index) as `${PaperPhase}`;
}

/** 嵌入工作台侧栏头部的阶段 Cockpit（与 Tab 栏联动） */
export function ProjectCockpitSidebar({
  paperPassportRaw,
  activeTab,
  className,
  onNavigate,
}: ProjectCockpitSidebarProps) {
  const passport = parsePaperPassport(paperPassportRaw ?? null);
  if (!passport) return null;

  const hint = getNextPhaseHint(passport);
  const currentPhase = passport.currentPhase;
  const currentStatus = passport.phaseStatus[phaseKey(currentPhase)] ?? "locked";
  const currentLabel = PAPER_PHASE_LABELS[currentPhase] ?? "";
  const primaryTab = getPrimaryTabForPhase(currentPhase);
  const tabAligned = isTabAlignedWithPhase(activeTab, currentPhase);
  const primaryTabLabel = PHASE_TAB_LABELS[primaryTab];

  const handlePhaseClick = (index: PaperPhase) => {
    if (!onNavigate) return;
    const status = passport.phaseStatus[phaseKey(index)] ?? "locked";
    if (!isPhaseNavigable(index, status)) return;
    const action = getPhaseNavigationAction(index);
    if (action) onNavigate(action);
  };

  const handleGoToPrimary = () => {
    if (!onNavigate || currentStatus === "done") return;
    const action = getPhaseNavigationAction(currentPhase);
    if (action) onNavigate(action);
  };

  return (
    <div className={cn("space-y-2 border-t border-[#1a5632]/10 pt-2 mt-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-[#1a5632]">
            P{currentPhase} {currentLabel}
          </p>
          {hint && currentStatus !== "done" && (
            <p className="text-[10px] text-[#6b7c72] leading-snug line-clamp-2">
              {hint}
            </p>
          )}
        </div>
        {!tabAligned && hint && currentStatus !== "done" && onNavigate && (
          <button
            type="button"
            onClick={handleGoToPrimary}
            className="shrink-0 rounded-md bg-[#1a5632] px-2 py-1 text-[10px] font-medium text-white hover:bg-[#1a5632]/90"
          >
            去{primaryTabLabel}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
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
              title={`P${index} ${label}`}
              onClick={navigable ? () => handlePhaseClick(index as PaperPhase) : undefined}
              className={cn(
                "flex shrink-0 flex-col items-center gap-0.5 px-0.5",
                navigable && "cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "block h-2 w-2 rounded-full",
                  STATUS_DOT[status],
                  isCurrent && "ring-2 ring-[#1a5632]/40 ring-offset-1",
                )}
              />
              <span className="max-w-[2rem] truncate text-[7px] text-[#9aa8a0]">{index}</span>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

/** @deprecated 使用 ProjectCockpitSidebar（侧栏集成版） */
export { ProjectCockpitSidebar as ProjectCockpitBar };
