"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DIALOG_FULL } from "@/components/ui/dialog-sizes";
import { cn } from "@/lib/utils";
import type { ProjectData } from "@/contracts/project";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import { BlueprintWorkspace } from "@/components/shared/blueprint/blueprint-workspace";

interface BlueprintWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blueprint: WritingBlueprint | null;
  project: ProjectData;
  projectId: string;
  isStale: boolean;
  onSave: (blueprint: WritingBlueprint) => void;
}

/** Base UI：Select 下拉在 Portal 内获焦时会触发 focus-out，误关父 Dialog */
const IGNORE_CLOSE_REASONS = new Set(["focus-out", "outside-press"]);

export function BlueprintWorkspaceDialog({
  open,
  onOpenChange,
  blueprint,
  project,
  projectId,
  isStale,
  onSave,
}: BlueprintWorkspaceDialogProps) {
  const requestCloseRef = useRef<() => boolean>(() => true);
  /** 项目刷新瞬间 blueprint 可能短暂为 null；用粘性缓存避免 Dialog 卸载=被关掉 */
  const [stickyBlueprint, setStickyBlueprint] = useState<WritingBlueprint | null>(
    blueprint,
  );

  useEffect(() => {
    if (blueprint) setStickyBlueprint(blueprint);
  }, [blueprint]);

  useEffect(() => {
    if (!open) setStickyBlueprint(blueprint);
  }, [open, blueprint]);

  const registerRequestClose = useCallback((fn: () => boolean) => {
    requestCloseRef.current = fn;
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean, eventDetails?: { reason?: string }) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      const reason = eventDetails?.reason;
      if (reason && IGNORE_CLOSE_REASONS.has(reason)) {
        return;
      }
      if (requestCloseRef.current()) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  const displayBlueprint = blueprint ?? stickyBlueprint;
  if (!displayBlueprint) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      disablePointerDismissal
    >
      <DialogContent
        className={cn(
          DIALOG_FULL,
          "gap-0 overflow-hidden border-0 bg-[#eef1ee] p-0 shadow-2xl shadow-[#122820]/15 sm:rounded-2xl",
        )}
        // 避免关闭瞬间焦点抢回触发二次 dismiss
        finalFocus={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>写作蓝图</DialogTitle>
          <DialogDescription>
            编辑论点、配图与分节要点，保存后用于章节扩写。
          </DialogDescription>
        </DialogHeader>
        <BlueprintWorkspace
          blueprint={displayBlueprint}
          project={project}
          projectId={projectId}
          isStale={isStale}
          onSave={onSave}
          registerRequestClose={registerRequestClose}
        />
      </DialogContent>
    </Dialog>
  );
}
