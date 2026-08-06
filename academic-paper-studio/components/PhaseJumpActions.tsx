"use client";

import { getPhaseJumpTargets, resolveJumpHref, type StudioPhase } from "../flow";
import { buttonVariants } from "@/components/ui/button";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface PhaseJumpActionsProps {
  phase: StudioPhase;
  projectId: string | null;
  track?: "5a" | "5b";
  /** 只显示第一条主入口（阶段页用） */
  primaryOnly?: boolean;
}

/**
 * 只渲染「真能打开」的入口。未关联项目时给明确下一步，不放灰色假按钮。
 */
export function PhaseJumpActions({
  phase,
  projectId,
  track,
  primaryOnly = false,
}: PhaseJumpActionsProps) {
  const targets = getPhaseJumpTargets(phase, projectId, track);
  const list = primaryOnly ? targets.slice(0, 1) : targets;

  if (!projectId) {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
        还没关联项目，上面的「关联论文项目」选好后再来。
        <a href="/projects" className="ml-2 font-medium text-[#1a5632] underline underline-offset-2">
          或先去新建
        </a>
      </div>
    );
  }

  if (list.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {list.map((t, i) => {
        const href = resolveJumpHref(t.href, projectId);
        if (!href) return null;
        const isPrimary = i === 0;
        return (
          <a
            key={t.id}
            href={href}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition",
              isPrimary
                ? "border-[#1a5632]/35 bg-[#1a5632] text-white hover:bg-[#144228]"
                : "border-[#1a5632]/15 bg-white text-[#122820] hover:border-[#1a5632]/30",
            )}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-xs leading-relaxed",
                  isPrimary ? "text-white/80" : "text-[#6b7c72]",
                )}
              >
                {t.hint}
              </span>
            </span>
            <span
              className={cn(
                buttonVariants({ size: "sm", variant: isPrimary ? "secondary" : "outline" }),
                "shrink-0",
                isPrimary ? "bg-white text-[#1a5632] hover:bg-white/90" : undefined,
                !isPrimary ? siteTheme.btnGhost : undefined,
              )}
            >
              打开
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </span>
          </a>
        );
      })}
    </div>
  );
}
