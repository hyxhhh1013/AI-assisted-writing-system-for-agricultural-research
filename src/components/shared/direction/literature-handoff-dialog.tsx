"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookMarked, Loader2 } from "lucide-react";
import type { DirectionLiteratureEntry } from "@/contracts/direction-literature";
import { MIN_REVIEW_HANDOFF_ENTRIES } from "@/contracts/direction-literature";
import type { SourceRole } from "@/contracts/direction-writing-bridge";

const ROLE_LABELS: Record<SourceRole, string> = {
  core: "核心",
  supporting: "支撑",
  background: "背景",
};

interface LiteratureHandoffDialogProps {
  open: boolean;
  paperTitle: string;
  paperType: "review" | "research";
  entries: DirectionLiteratureEntry[];
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

/** 路线图 Handoff 第 2 步：从 Direction corpus 勾选本篇参考文献 */
export function LiteratureHandoffDialog({
  open,
  paperTitle,
  paperType,
  entries,
  loading = false,
  onCancel,
  onConfirm,
}: LiteratureHandoffDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const core = entries.filter((e) => e.role === "core").map((e) => e.id);
    setSelected(new Set(core.length > 0 ? core : entries.map((e) => e.id)));
  }, [open, entries]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(entries.map((e) => e.id)));
  const selectCore = () =>
    setSelected(new Set(entries.filter((e) => e.role === "core").map((e) => e.id)));

  const handleConfirm = () => {
    const ids = Array.from(selected);
    if (paperType === "review" && ids.length < MIN_REVIEW_HANDOFF_ENTRIES) {
      return;
    }
    onConfirm(ids);
  };

  const canConfirm =
    paperType === "research"
      ? selected.size >= 0
      : selected.size >= MIN_REVIEW_HANDOFF_ENTRIES;

  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookMarked className="h-5 w-5 text-[#6366f1]" />
            选择本篇参考文献
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            从方向文献 corpus 勾选将写入「{paperTitle}」的参考文献。
            {paperType === "review" && ` 综述至少选 ${MIN_REVIEW_HANDOFF_ENTRIES} 篇。`}
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            方向尚未建立文献 corpus，请先在文献备料确认后再创建写作项目。
          </p>
        ) : (
          <>
            <div className="flex gap-2 text-[10px]">
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={selectAll}>
                全选
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={selectCore}>
                仅核心
              </Button>
              <span className="ml-auto self-center text-muted-foreground">
                已选 {selected.size} / {entries.length}
              </span>
            </div>
            <ScrollArea className="max-h-[min(360px,50vh)] rounded-md border">
              <div className="space-y-1 p-2">
                {entries.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(entry.id)}
                      onCheckedChange={() => toggle(entry.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium leading-snug">{entry.title}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {ROLE_LABELS[entry.role]} · {entry.source}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-[#1a5632] hover:bg-[#1a5632]/90"
            disabled={!canConfirm || entries.length === 0 || loading}
            onClick={handleConfirm}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            创建写作项目
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
