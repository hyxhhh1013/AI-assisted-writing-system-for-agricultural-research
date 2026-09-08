"use client";

import {
  ClipboardCheck, LayoutDashboard, Search, Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualityStation } from "@/components/shared/quality/types";

const STATIONS: {
  id: QualityStation;
  label: string;
  icon: typeof Search;
  requiresResult?: boolean;
  requiresProject?: boolean;
}[] = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "check", label: "查重", icon: Search },
  { id: "rewrite", label: "降重", icon: Shuffle, requiresResult: true },
  { id: "review", label: "审查", icon: ClipboardCheck, requiresProject: true },
];

interface QualityStationNavProps {
  station: QualityStation;
  hasResult: boolean;
  hasProject: boolean;
  onSelect: (id: QualityStation) => void;
}

export function QualityStationNav({
  station,
  hasResult,
  hasProject,
  onSelect,
}: QualityStationNavProps) {
  return (
    <div className="mb-3 flex shrink-0 gap-1 overflow-x-auto rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-[#1a5632]/8">
      {STATIONS.map((t) => {
        const disabled =
          (t.requiresResult && !hasResult) || (t.requiresProject && !hasProject);
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            className={cn(
              "flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-medium transition-all",
              station === t.id
                ? "bg-[#1a5632] text-white shadow-sm"
                : disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "text-[#3d4f46] hover:bg-[#1a5632]/8",
            )}
            onClick={() => !disabled && onSelect(t.id)}
          >
            <t.icon className="h-3.5 w-3.5 shrink-0" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
