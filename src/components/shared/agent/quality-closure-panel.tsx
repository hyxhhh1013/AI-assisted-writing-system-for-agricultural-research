"use client";

import { useEffect, useMemo, useState } from "react";
import { getCitationGateStatus } from "@/services/citations";
import { getReviewRoundStatusClient } from "@/services/review";
import {
  buildQualityClosure,
  type QualitySignalStatus,
} from "@/lib/agent/quality-closure";
import { cn } from "@/lib/utils";

interface QualityClosurePanelProps {
  projectId?: string;
  sections?: Record<string, string>;
  mode?: "review" | "research";
  language?: "zh" | "en";
}

const STATUS_STYLE: Record<
  QualitySignalStatus,
  { dot: string; chip: string }
> = {
  ok: { dot: "bg-[#1a8a5a]", chip: "text-[#1a8a5a] bg-[#e8f4ee]" },
  warn: { dot: "bg-[#d97706]", chip: "text-[#b45309] bg-[#fdf3e3]" },
  missing: { dot: "bg-[#9aa8a0]", chip: "text-[#6b7a72] bg-[#eef1ef]" },
};

/**
 * 论文质量收口看板：聚合 节完整度 / 摘要 / 引用硬检 / 审查 四个质量信号，
 * 一行展示「还差什么、能否导出」。数据：节完整度前端算，引用/审查走 services。
 */
export function QualityClosurePanel({
  projectId,
  sections,
  mode,
  language,
}: QualityClosurePanelProps) {
  const [citationPassed, setCitationPassed] = useState<boolean | null>(null);
  const [reviewDone, setReviewDone] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const [gate, rounds] = await Promise.all([
          getCitationGateStatus(projectId).catch(() => null),
          getReviewRoundStatusClient(projectId).catch(() => null),
        ]);
        if (cancelled) return;
        setCitationPassed(gate ? gate.passed : null);
        setReviewDone(Boolean(rounds && rounds.doneCount > 0));
      } catch {
        /* 拉取失败降级为空 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const result = useMemo(
    () =>
      buildQualityClosure({
        sections: sections ?? {},
        mode,
        language,
        citationPassed,
        reviewDone,
      }),
    [sections, mode, language, citationPassed, reviewDone],
  );

  return (
    <div className="rounded-xl border border-border/60 bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-[#122820]">
          质量收口
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {result.signals.map((s) => {
            const style = STATUS_STYLE[s.status];
            return (
              <span
                key={s.key}
                title={s.detail}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                  style.chip,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                {s.label}
                {s.status !== "ok" && s.status !== "missing" ? " ⚠" : ""}
              </span>
            );
          })}
        </div>
        <span
          className={cn(
            "shrink-0 text-[11px]",
            result.readyToClose ? "text-[#1a8a5a]" : "text-[#9aa8a0]",
          )}
        >
          {result.summary}
        </span>
      </div>
    </div>
  );
}
