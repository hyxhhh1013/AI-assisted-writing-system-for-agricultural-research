"use client";

import { cn } from "@/lib/utils";
import type { QualitySection } from "@/lib/quality-sections";

interface SectionSidebarProps {
  sections: QualitySection[];
  activeScope: "full" | string;
  onSelectScope: (scope: "full" | string) => void;
  hitCounts?: Record<string, { count: number; worst: "high" | "medium" | "low" | null }> | null;
  className?: string;
}

function hitDot(worst: "high" | "medium" | "low" | null): string {
  if (worst === "high") return "bg-[#c4453c]";
  if (worst === "medium") return "bg-[#c4922a]";
  if (worst === "low") return "bg-[#3d7a52]";
  return "bg-[#d5ddd4]";
}

export function SectionSidebar({
  sections,
  activeScope,
  onSelectScope,
  hitCounts = null,
  className,
}: SectionSidebarProps) {
  if (sections.length === 0) return null;

  const total = sections.reduce((n, s) => n + s.wordCount, 0);
  const totalHits = hitCounts
    ? Object.values(hitCounts).reduce((n, row) => n + row.count, 0)
    : null;

  return (
    <aside className={cn("flex w-56 shrink-0 flex-col border-r border-[#1a5632]/10 bg-[#faf9f6]/80 xl:w-64", className)}>
      <div className="border-b border-[#1a5632]/10 px-3 py-2.5">
        <p className="text-xs font-semibold text-[#122820]">论文章节</p>
        <p className="text-[10px] text-[#9aa8a0]">共 {total.toLocaleString()} 字 · {sections.length} 章</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <button
          type="button"
          onClick={() => onSelectScope("full")}
          className={cn(
            "w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
            activeScope === "full"
              ? "bg-[#1a5632] text-white shadow-sm"
              : "text-[#3d4f46] hover:bg-[#1a5632]/8",
          )}
        >
          <span className="font-medium">全文检测</span>
          <span className={cn("mt-0.5 block text-[10px]", activeScope === "full" ? "text-white/80" : "text-[#9aa8a0]")}>
            {totalHits == null ? "所有章节合并" : `${totalHits} 处重合`}
          </span>
        </button>
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelectScope(s.key)}
            className={cn(
              "w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
              activeScope === s.key
                ? "bg-[#1a5632] text-white shadow-sm"
                : "text-[#3d4f46] hover:bg-[#1a5632]/8",
            )}
          >
            <span className="font-medium truncate block">{s.title}</span>
            <span className={cn("mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums", activeScope === s.key ? "text-white/80" : "text-[#9aa8a0]")}>
              {hitCounts?.[s.key] && (
                <span className={cn("h-1.5 w-1.5 rounded-full", activeScope === s.key ? "bg-white/80" : hitDot(hitCounts[s.key]?.worst ?? null))} />
              )}
              {s.wordCount.toLocaleString()} 字
              {hitCounts?.[s.key] ? ` · ${hitCounts[s.key]?.count ?? 0} 处` : ""}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
