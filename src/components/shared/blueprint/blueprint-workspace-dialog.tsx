"use client";

import { useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DIALOG_FULL } from "@/components/ui/dialog-sizes";
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

  const registerRequestClose = useCallback((fn: () => boolean) => {
    requestCloseRef.current = fn;
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      if (requestCloseRef.current()) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  if (!blueprint) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={DIALOG_FULL}>
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>写作蓝图</DialogTitle>
          <DialogDescription>
            全文要点一览，可直接编辑；保存后用于章节扩写，不影响当前编辑器。
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <BlueprintWorkspace
            key={`${blueprint.generatedAt}-${blueprint.outlineHash}`}
            blueprint={blueprint}
            project={project}
            projectId={projectId}
            isStale={isStale}
            onSave={onSave}
            registerRequestClose={registerRequestClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
