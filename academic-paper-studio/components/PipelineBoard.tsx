"use client";

import type { StudioController } from "../hooks/use-studio-session";
import {
  PHASE_DEFINITIONS,
  getMode,
  canEnterPhase,
  IRON_RULES,
  type StudioPhase,
} from "../flow";
import { ProjectBinder } from "./ProjectBinder";
import { PhaseJumpActions } from "./PhaseJumpActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { Check, Lock, Circle, SkipForward } from "lucide-react";

interface PipelineBoardProps {
  studio: StudioController;
}

const STATUS_LABEL: Record<string, string> = {
  locked: "未解锁",
  ready: "可以开始",
  in_progress: "进行中",
  awaiting_confirm: "待确认",
  done: "已完成",
  skipped: "已跳过",
};

export function PipelineBoard({ studio }: PipelineBoardProps) {
  const { session, openPhase, goScreen } = studio;
  if (!session.mode) return null;
  const mode = getMode(session.mode);
  const activePhases = PHASE_DEFINITIONS.filter((p) => mode.phases.includes(p.id));
  const projectId = session.linkedProject?.id ?? null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#1a5632]">当前方式：{mode.title}</p>
          <h2 className="mt-1 text-2xl font-bold text-[#122820]">论文写作流水线</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#6b7c72]">
            每一步直接点绿色「打开」进真实工具；写完再点「本步说明」标记进度。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => goScreen("mode")}>
          更换写作方式
        </Button>
      </header>

      <ProjectBinder studio={studio} />

      <ol className="relative grid gap-4">
        {activePhases.map((phase, i) => {
          const status = session.phaseStatus[phase.id];
          const gate = canEnterPhase(session, phase.id);
          const unlocked =
            status === "ready"
            || status === "in_progress"
            || status === "done"
            || (status === "locked" && gate.ok);
          const showJump = unlocked;

          return (
            <li
              key={phase.id}
              className={cn(
                "rounded-2xl border p-4 sm:p-5",
                status === "done" || status === "skipped"
                  ? "border-[#1a5632]/15 bg-[#1a5632]/[0.04]"
                  : status === "in_progress" || status === "ready"
                    ? "border-[#1a5632]/30 bg-white shadow-sm"
                    : "border-[#1a5632]/8 bg-[#faf9f6] opacity-80",
              )}
            >
              <div className="flex gap-4">
                <PhaseGlyph status={status} index={i} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[#6b7c72]">
                      Phase {phase.id} · {phase.code}
                    </span>
                    <Badge variant="secondary" className="bg-white text-[#3d4f46]">
                      {STATUS_LABEL[status]}
                    </Badge>
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-[#122820]">{phase.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#3d4f46]">{phase.blurb}</p>
                  {!gate.ok && status === "locked" ? (
                    <p className="mt-2 text-xs text-[#9aa8a0]">暂不可进入：{gate.reason}</p>
                  ) : null}

                  {showJump ? (
                    <div className="mt-3 space-y-2">
                      <PhaseJumpActions
                        phase={phase.id}
                        projectId={projectId}
                        primaryOnly
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-[#6b7c72]"
                        onClick={() => openPhase(phase.id)}
                      >
                        本步说明与「标记完成」
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <details className="rounded-2xl border border-[#1a5632]/10 bg-white/80 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[#122820]">
          查看流程铁律（必读）
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-[#3d4f46]">
          {IRON_RULES.map((r) => (
            <li key={r.id}>
              <span className="font-medium text-[#1a5632]">{r.title}：</span>
              {r.body}
            </li>
          ))}
        </ul>
      </details>

      <CheckpointSummary session={session} />
    </div>
  );
}

function PhaseGlyph({
  status,
  index,
}: {
  status: string;
  index: number;
}) {
  const base =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold";
  if (status === "done") {
    return (
      <div className={cn(base, "border-[#1a5632] bg-[#1a5632] text-white")}>
        <Check className="h-5 w-5" />
      </div>
    );
  }
  if (status === "skipped") {
    return (
      <div className={cn(base, "border-[#1a5632]/30 text-[#1a5632]")}>
        <SkipForward className="h-4 w-4" />
      </div>
    );
  }
  if (status === "locked") {
    return (
      <div className={cn(base, "border-[#1a5632]/15 text-[#9aa8a0]")}>
        <Lock className="h-4 w-4" />
      </div>
    );
  }
  if (status === "in_progress" || status === "ready") {
    return (
      <div className={cn(base, "border-[#1a5632] text-[#1a5632]")}>
        <Circle className="h-4 w-4 fill-[#1a5632]/20" />
      </div>
    );
  }
  return (
    <div className={cn(base, "border-[#1a5632]/20 text-[#3d4f46]")}>{index + 1}</div>
  );
}

function CheckpointSummary({ session }: { session: StudioController["session"] }) {
  const items = [
    { ok: session.checkpoints.configConfirmed, label: "配置记录已确认" },
    { ok: session.checkpoints.outlineApproved, label: "大纲已批准" },
    { ok: session.checkpoints.sourcesReviewed || session.checkpoints.skipLiterature, label: "文献已过目或已跳过" },
    {
      ok: session.checkpoints.revisionRound <= 2,
      label: `修订轮次 ${session.checkpoints.revisionRound}/2`,
    },
    {
      ok: !session.checkpoints.criticalIssuesBlocking,
      label: session.checkpoints.criticalIssuesBlocking
        ? "存在严重问题（拦住排版）"
        : "无严重拦截问题",
    },
  ];
  return (
    <div className={cn(siteTheme.card, "p-4")}>
      <h3 className="text-sm font-semibold text-[#122820]">检查点状态</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.label}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              item.ok ? "bg-[#1a5632]/8 text-[#1a5632]" : "bg-amber-50 text-amber-900",
            )}
          >
            {item.ok ? "✓" : "○"} {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { StudioPhase };
