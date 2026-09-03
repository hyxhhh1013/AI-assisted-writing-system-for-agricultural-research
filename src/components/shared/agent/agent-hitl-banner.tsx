"use client";

import { HITL_EYEBROW, HITL_EYEBROW_DANGER } from "@/lib/agent/hitl";
import { cn } from "@/lib/utils";

interface AgentHitlBannerProps {
  title: string;
  detail: string;
  danger?: boolean;
  eyebrow?: string;
  className?: string;
}

export function AgentHitlBanner({
  title,
  detail,
  danger,
  eyebrow,
  className,
}: AgentHitlBannerProps) {
  return (
    <div className={className}>
      <p
        className={cn(
          "text-[10px] font-medium tracking-wide",
          danger ? "text-red-700" : "text-[#1a5632]",
        )}
      >
        {eyebrow ?? (danger ? HITL_EYEBROW_DANGER : HITL_EYEBROW)}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-[#122820]">{title}</p>
      <p className="mt-1 text-[11px] leading-snug text-[#5a7a68]">{detail}</p>
    </div>
  );
}
