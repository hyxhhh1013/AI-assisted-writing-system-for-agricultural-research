"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutlineTask } from "@/lib/utils";
import { getSectionKeysForMode, getSectionLabelForMode } from "@/lib/section-registry";
import type { ProjectWritingMode } from "@/contracts/writing-mode";

interface WritingOutlineTaskListProps {
  outlineTasks: OutlineTask[];
  selectedSectionId: string;
  expandedSections?: string[];
  projectMode?: ProjectWritingMode;
  onSelectTask: (task: OutlineTask) => void;
  onRefreshOutline: () => void;
}

export function WritingOutlineTaskList({
  outlineTasks,
  selectedSectionId,
  expandedSections,
  projectMode = "review",
  onSelectTask,
  onRefreshOutline,
}: WritingOutlineTaskListProps) {
  const sectionOrder = getSectionKeysForMode(projectMode);

  let listBody: ReactNode;
  if (outlineTasks.length > 0) {
    const grouped = new Map<string, OutlineTask[]>();
    for (const t of outlineTasks) {
      const key = t.sectionKey;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(t);
    }

    const rows: ReactNode[] = [];
    for (const key of sectionOrder) {
      const tasks = grouped.get(key);
      if (!tasks || tasks.length === 0) continue;
      rows.push(
        <div
          key={`hdr-${key}`}
          className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-muted/40 uppercase tracking-wider border-b"
        >
          {getSectionLabelForMode(key, projectMode) || key}
        </div>,
      );
      for (const task of tasks) {
        const isExpanded = expandedSections?.includes(task.id);
        const sameTitleCount = tasks.filter((t) => t.title === task.title).length;
        const sameTitleIndex = tasks.filter((t) => t.title === task.title).indexOf(task);
        const displayTitle =
          sameTitleCount > 1 ? `${task.title} (${sameTitleIndex + 1})` : task.title;
        rows.push(
          <div
            key={task.id}
            onClick={() => onSelectTask(task)}
            className={cn(
              "flex items-center justify-between p-2 cursor-pointer transition-colors hover:bg-primary/10",
              selectedSectionId === task.id ? "bg-primary/15 border-l-2 border-primary" : "",
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden min-w-0">
              <span className="truncate text-xs" title={task.fullPath}>
                {displayTitle}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isExpanded && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>,
        );
      }
    }
    listBody = <div className="divide-y">{rows}</div>;
  } else {
    listBody = (
      <div className="p-4 text-center text-xs text-muted-foreground italic">请先生成论文大纲</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">选择大纲任务（按子节扩写）</Label>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-primary"
          onClick={onRefreshOutline}
          title="刷新大纲任务"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div className="border rounded-md max-h-[140px] overflow-y-auto bg-muted/20">{listBody}</div>
    </div>
  );
}
