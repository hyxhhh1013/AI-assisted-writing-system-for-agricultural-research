"use client";

import Link from "next/link";
import { ArrowRight, PackageOpen } from "lucide-react";
import type { PaperPassport } from "@/contracts/paper-passport";

interface ProjectHandoffBannerProps {
  passport: PaperPassport | null;
  referenceCount: number;
}

/** 来自 Direction Handoff 的项目：提示备料来源（不展示 P0/P1/P2 阶段流） */
export function ProjectHandoffBanner({
  passport,
  referenceCount,
}: ProjectHandoffBannerProps) {
  const source = passport?.source;
  if (!source?.directionSlug) return null;

  return (
    <div className="shrink-0 mb-3 rounded-lg border border-[#6366f1]/20 bg-[#6366f1]/5 px-3 py-2.5 text-[10px] leading-relaxed text-[#3d4f45]">
      <p className="font-semibold text-[#6366f1] flex items-center gap-1.5">
        <PackageOpen className="h-3.5 w-3.5" />
        来自方向备料
      </p>
      <p className="mt-1">
        已导入参考文献 {referenceCount} 篇，可在工作台继续写作与补录。
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
