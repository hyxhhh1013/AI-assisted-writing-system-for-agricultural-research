"use client";

import { Button } from "@/components/ui/button";
import type { AgentContinueHint } from "@/lib/agent/continue-hint";

interface AgentContinueBarProps {
  hint: AgentContinueHint;
  disabled?: boolean;
  onContinue: (goal: string) => void;
}

/** 输入区上方的续跑提示：和检查点条同一套克制样式，不另做营销按钮 */
export function AgentContinueBar({
  hint,
  disabled,
  onContinue,
}: AgentContinueBarProps) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#1a5632]/12 bg-[#f6f8f6] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] leading-snug text-[#122820]">
          <span className="text-[#5a7a68]">{hint.eyebrow}</span>
          <span className="mx-1.5 text-[#1a5632]/25">·</span>
          <span className="font-medium">{hint.title}</span>
        </p>
        <p className="truncate text-[11px] leading-snug text-[#5a7a68]" title={hint.detail}>
          {hint.detail}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className="h-8 shrink-0 rounded-lg border-[#1a5632]/20 bg-white px-3 text-xs font-medium text-[#122820] hover:bg-white hover:text-[#122820]"
        onClick={() => onContinue(hint.goal)}
      >
        {hint.cta}
      </Button>
    </div>
  );
}
