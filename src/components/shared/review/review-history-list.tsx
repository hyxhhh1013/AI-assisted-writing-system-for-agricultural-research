"use client";

import { Loader2, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReviewHistoryItem } from "@/contracts/review";
import { cn } from "@/lib/utils";

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-yellow-100 text-yellow-800",
  D: "bg-red-100 text-red-800",
};

interface ReviewHistoryListProps {
  items: ReviewHistoryItem[];
  selectedId?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReviewHistoryList({
  items,
  selectedId,
  isLoading,
  error,
  onSelect,
  onRefresh,
}: ReviewHistoryListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[#6b7c72]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载历史记录...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
        {error}
        {onRefresh ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
            重试
          </Button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#1a5632]/15 px-4 py-10 text-center text-sm text-[#6b7c72]">
        <Clock className="mx-auto mb-2 h-8 w-8 text-[#1a5632]/30" />
        暂无审查记录
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[#1a5632]/8 overflow-hidden rounded-xl border border-[#1a5632]/10 bg-white/80">
      {items.map((item) => {
        const grade = item.overallGrade ?? "—";
        const gradeClass = GRADE_COLORS[grade] ?? "bg-muted text-muted-foreground";

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1a5632]/5",
                selectedId === item.id && "bg-[#1a5632]/8",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#122820]">
                  {item.title || "未命名论文"}
                </p>
                <p className="mt-0.5 text-xs text-[#9aa8a0]">{formatDate(item.createdAt)}</p>
                {item.synopsis ? (
                  <p className="mt-1 line-clamp-2 text-xs text-[#6b7c72]">{item.synopsis}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {item.overallScore != null ? (
                  <span className="text-sm font-semibold text-[#122820]">{item.overallScore}</span>
                ) : null}
                <Badge variant="outline" className={cn("text-[10px]", gradeClass)}>
                  {grade}
                </Badge>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#1a5632]/30" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
