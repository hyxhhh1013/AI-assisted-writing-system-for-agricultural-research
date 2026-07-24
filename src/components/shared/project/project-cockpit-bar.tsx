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
  phasePrefersAgentTab,
  PHASE_TAB_LABELS,
  type CockpitNavigationAction,
  type CockpitControlMode,
} from "@/lib/paper-passport-navigation";
import { getPhaseTasks, countPendingTasks } from "@/lib/paper-passport-tasks";
import type { PassportProgressSignals } from "@/lib/paper-passport-progress";
import { getPhaseTaskPack } from "@/contracts/phase-task-pack";
import { CheckCircle2, Circle, Lock } from "lucide-react";

const AGENT_TAB_ENABLED = process.env.NEXT_PUBLIC_AGENT_ENABLED === "1";

export type { CockpitControlMode } from "@/lib/paper-passport-navigation";

interface ProjectCockpitSidebarProps {
  paperPassportRaw?: string | null;
  activeTab: string;
  controlMode: CockpitControlMode;
  onControlModeChange: (mode: CockpitControlMode) => void;
  signals: PassportProgressSignals;
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

function resolveNavigateTarget(
  phase: PaperPhase,
  controlMode: CockpitControlMode,
): CockpitNavigationAction | null {
  if (controlMode === "agent" && AGENT_TAB_ENABLED && phasePrefersAgentTab(phase)) {
    return { type: "workbench-tab", tab: "agent" };
  }
  return getPhaseNavigationAction(phase);
}

/** 嵌入工作台侧栏头部的阶段 Cockpit（与 Tab 栏联动） */
export function ProjectCockpitSidebar({
  paperPassportRaw,
  activeTab,
  controlMode,
  onControlModeChange,
  signals,
  className,
  onNavigate,
}: ProjectCockpitSidebarProps) {
  const passport = parsePaperPassport(paperPassportRaw ?? null);
  if (!passport) return null;

  const hint = getNextPhaseHint(passport);
  const currentPhase = passport.currentPhase;
  const currentStatus = passport.phaseStatus[phaseKey(currentPhase)] ?? "locked";
  const currentLabel = PAPER_PHASE_LABELS[currentPhase] ?? "";
  const phasePack = getPhaseTaskPack(currentPhase);
  const primaryTab = getPrimaryTabForPhase(currentPhase);
  const agentAligned =
    controlMode === "agent"
    && activeTab === "agent"
    && phasePrefersAgentTab(currentPhase);
  const tabAligned = isTabAlignedWithPhase(activeTab, currentPhase) || agentAligned;
  const primaryTabLabel =
    controlMode === "agent" && AGENT_TAB_ENABLED && phasePrefersAgentTab(currentPhase)
      ? "Agent"
      : PHASE_TAB_LABELS[primaryTab];

  const tasks = getPhaseTasks(currentPhase, passport, signals, controlMode);
  const pendingCount = countPendingTasks(tasks);

  const handlePhaseClick = (index: PaperPhase) => {
    if (!onNavigate) return;
    const status = passport.phaseStatus[phaseKey(index)] ?? "locked";
    if (!isPhaseNavigable(index, status)) return;
    const action = resolveNavigateTarget(index, controlMode);
    if (action) onNavigate(action);
  };

  const handleGoToPrimary = () => {
    if (!onNavigate || currentStatus === "done") return;
    const action = resolveNavigateTarget(currentPhase, controlMode);
    if (action) onNavigate(action);
  };

  return (
    <div className={cn("space-y-2 border-t border-[#1a5632]/10 pt-2 mt-2", className)}>
      {AGENT_TAB_ENABLED ? (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[#6b7c72] mr-1">协作</span>
          <button
            type="button"
            onClick={() => onControlModeChange("human")}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium",
              controlMode === "human"
                ? "bg-[#1a5632] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            手动
          </button>
          <button
            type="button"
            onClick={() => onControlModeChange("agent")}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium",
              controlMode === "agent"
                ? "bg-[#2563eb] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Agent
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-[#1a5632]">
            P{currentPhase} {currentLabel}
            {pendingCount > 0 && (
              <span className="ml-1 font-normal text-[#6b7c72]">({pendingCount} 待办)</span>
            )}
          </p>
          <p className="text-[10px] text-[#3d4f46] leading-snug line-clamp-2">
            {phasePack.goal}
          </p>
          {hint && currentStatus !== "done" && (
            <p className="text-[10px] text-[#6b7c72] leading-snug line-clamp-1">{hint}</p>
          )}
        </div>
        {currentStatus !== "done" && onNavigate && (
          <button
            type="button"
            onClick={handleGoToPrimary}
            className="shrink-0 rounded-md bg-[#1a5632] px-2 py-1 text-[10px] font-medium text-white hover:bg-[#1a5632]/90"
          >
            {controlMode === "agent" && phasePrefersAgentTab(currentPhase)
              ? "完成阶段"
              : tabAligned
                ? `看${primaryTabLabel}`
                : `去${primaryTabLabel}`}
          </button>
        )}
      </div>

      {controlMode === "agent" && phasePack.preferredTools.length > 0 ? (
        <p className="text-[9px] text-[#9aa8a0] leading-snug">
          推荐工具：{phasePack.preferredTools.join(" → ")}
        </p>
      ) : null}

      <ul className="space-y-1 rounded-md bg-white/60 px-2 py-1.5">
        {tasks.map((item) => {
          const clickable = item.status === "pending" && item.navigation && onNavigate;
          const Tag = clickable ? "button" : "li";
          return (
            <Tag
              key={item.id}
              type={clickable ? "button" : undefined}
              onClick={clickable ? () => onNavigate!(item.navigation!) : undefined}
              className={cn(
                "flex w-full items-start gap-1.5 text-left text-[10px] text-[#3d4f45]",
                clickable && "rounded px-1 py-0.5 hover:bg-[#1a5632]/5 cursor-pointer",
              )}
            >
              {item.status === "done" ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-[#1a5632] mt-0.5" />
              ) : item.status === "locked" ? (
                <Lock className="h-3 w-3 shrink-0 text-[#9aa8a0] mt-0.5" />
              ) : (
                <Circle className="h-3 w-3 shrink-0 text-[#2563eb] mt-0.5" />
              )}
              <span className={cn(item.status === "done" && "text-[#6b7c72] line-through")}>{item.label}</span>
            </Tag>
          );
        })}
      </ul>

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

export { ProjectCockpitSidebar as ProjectCockpitBar };
