"use client";

import { cn } from "@/lib/utils";
import { getWritingModeMeta, type ProjectWritingMode } from "@/contracts/writing-mode";

interface ProjectModeBadgeProps {
  mode: ProjectWritingMode | undefined;
  size?: "sm" | "md";
  className?: string;
}

export function ProjectModeBadge({ mode, size = "sm", className }: ProjectModeBadgeProps) {
  const meta = getWritingModeMeta(mode);
  const isResearch = mode === "research";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        isResearch ? "bg-[#1a5632]/10 text-[#1a5632]" : "bg-[#2563eb]/10 text-[#1d4ed8]",
        className,
      )}
    >
      {meta.shortLabel}
    </span>
  );
}
