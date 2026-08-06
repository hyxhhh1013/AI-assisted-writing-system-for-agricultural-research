"use client";

import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PhaseCheck } from "@/lib/direction-phase-readiness";

interface DirectionPhaseOverviewProps {
  phase: number;
  title: string;
  description: string;
  checks: PhaseCheck[];
  ready?: boolean;
  badge?: string;
  onAction?: () => void;
  actionLabel?: string;
  secondaryAction?: () => void;
  secondaryLabel?: string;
}

function CheckIcon({ check }: { check: PhaseCheck }) {
  if (check.passed) return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#059669]" />;
  if (check.severity === "high") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#dc2626]" />;
  return <Circle className="h-3.5 w-3.5 shrink-0 text-[#d97706]" />;
}

export function DirectionPhaseOverview({
  phase,
  title,
  description,
  checks,
  ready,
  badge,
  onAction,
  actionLabel,
  secondaryAction,
  secondaryLabel,
}: DirectionPhaseOverviewProps) {
  return (
    <div className="rounded-xl border border-[#1a5632]/10 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#122820]">
            Phase {phase} — {title}
            {badge && (
              <span className="rounded-md border border-[#2563eb]/15 bg-[#2563eb]/5 px-1.5 py-0.5 text-[10px] font-normal text-[#2563eb]">
                {badge}
              </span>
            )}
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#6b7c72]">{description}</p>
        </div>
        {ready && (
          <span className="shrink-0 rounded-lg border border-[#059669]/20 bg-[#059669]/5 px-2.5 py-1 text-[10px] text-[#059669]">
            就绪
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {checks.map((check) => (
          <div key={check.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs">
            <CheckIcon check={check} />
            <div>
              <span
                className={cn(
                  "font-medium",
                  !check.passed && check.severity === "high" && "text-[#dc2626]",
                )}
              >
                {check.label}
              </span>
              {!check.passed && check.hint && (
                <p className="mt-0.5 text-[10px] text-[#9aa8a0]">{check.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {(onAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {onAction && actionLabel && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onAction}>
              {actionLabel} <ArrowRight className="h-3 w-3" />
            </Button>
          )}
          {secondaryAction && secondaryLabel && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={secondaryAction}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
