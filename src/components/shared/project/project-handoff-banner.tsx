"use client";

import Link from "next/link";
import { ArrowRight, PackageOpen } from "lucide-react";
import type { PaperPassport } from "@/contracts/paper-passport";
import { PAPER_PHASE_LABELS } from "@/contracts/paper-passport";

interface ProjectHandoffBannerProps {
  passport: PaperPassport | null;
  referenceCount: number;
}

/** 来自 Direction Handoff 的项目：提示 P0/P1 已在备料层完成 */
export function ProjectHandoffBanner({
  passport,
  referenceCount,
}: ProjectHandoffBannerProps) {
  const source = passport?.source;
  if (!source?.directionSlug) return null;

  const p0Done = passport?.phaseStatus?.["0"] === "done";
  const p1Done = passport?.phaseStatus?.["1"] === "done";
  const writingPhase = passport?.currentPhase ?? 2;
  const phaseLabel = PAPER_PHASE_LABELS[writingPhase] ?? "写作";

  return (
    <div className="shrink-0 mb-3 rounded-lg border border-[#6366f1]/20 bg-[#6366f1]/5 px-3 py-2.5 text-[10px] leading-relaxed text-[#3d4f45]">
      <p className="font-semibold text-[#6366f1] flex items-center gap-1.5">
        <PackageOpen className="h-3.5 w-3.5" />
        方向备料已完成 · 工作台负责 P2+ 写作
      </p>
      <p className="mt-1">
        P0 配置{p0Done ? " ✓" : " …"} · P1 文献 {referenceCount} 篇{p1Done ? " ✓" : " …"}
        · 当前阶段 P{writingPhase} {phaseLabel}
      </p>
      <Link
        href={`/directions/${source.directionSlug}?tab=assets`}
        className="mt-1 inline-flex items-center gap-0.5 text-[#1a5632] hover:underline font-medium"
      >
        回方向修改配置或文献 corpus
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
