"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentHitlBanner } from "@/components/shared/agent/agent-hitl-banner";
import { ImportConfirmList } from "@/components/shared/agent/import-confirm-list";
import type { ExternalLiteratureHit } from "@/contracts/literature";
import {
  confirmToolDetail,
  confirmToolTitle,
  isDestructiveConfirmTool,
} from "@/lib/agent/hitl";
import { cn } from "@/lib/utils";

interface AgentToolConfirmProps {
  tool: string;
  message: string;
  preview?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importItems?: ExternalLiteratureHit[];
  importSelected?: Set<number> | null;
  onToggleImport?: (idx: number, checked: boolean) => void;
  onSetAllImport?: (checked: boolean) => void;
  importSelectedCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AgentToolConfirm({
  tool,
  message,
  preview,
  open,
  onOpenChange,
  importItems = [],
  importSelected,
  onToggleImport,
  onSetAllImport,
  importSelectedCount = 0,
  onConfirm,
  onCancel,
}: AgentToolConfirmProps) {
  const danger = isDestructiveConfirmTool(tool);
  const isImport = tool === "import_reference" && importItems.length > 0;
  const title = confirmToolTitle(tool);
  const detail = confirmToolDetail(tool, isImport ? importSelectedCount : undefined);
  const confirmDisabled = isImport && importSelectedCount === 0;
  const confirmLabel = isImport
    ? `确认导入 ${importSelectedCount} 篇`
    : danger
      ? "确认删除"
      : tool === "import_reference"
        ? "确认导入"
        : "确认执行";

  return (
    <>
      <div
        className={cn(
          "rounded-xl border bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(26,86,50,0.04)]",
          danger ? "border-red-200" : "border-[#1a5632]/18",
        )}
      >
        <AgentHitlBanner title={title} detail={detail} danger={danger} />
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 text-xs"
            variant={danger ? "destructive" : "default"}
            onClick={() => onOpenChange(true)}
          >
            打开确认页
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={onCancel}
          >
            取消
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(92vh,52rem)] w-[min(100%-1.5rem,42rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogHeader
            className={cn(
              "shrink-0 border-b px-5 py-4 pr-12 text-left",
              danger ? "border-red-100 bg-red-50/80" : "border-[#1a5632]/10 bg-[#f6f8f6]",
            )}
          >
            <p
              className={cn(
                "text-[10px] font-medium tracking-wide",
                danger ? "text-red-700" : "text-[#1a5632]",
              )}
            >
              {danger ? "人控节点 · 确认后才会删" : "人控节点 · 确认后我才改项目"}
            </p>
            <DialogTitle className="mt-1 text-base text-[#122820]">{title}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#5a7a68]">
              {message}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
            {isImport && onToggleImport && onSetAllImport ? (
              <ImportConfirmList
                items={importItems}
                selected={importSelected ?? null}
                onToggle={onToggleImport}
                onSetAll={onSetAllImport}
                className="mt-0"
                listClassName="max-h-[min(48vh,22rem)]"
              />
            ) : preview?.trim() ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-[#1a5632]/10 bg-[#f6f8f6] p-3 text-[13px] leading-6 text-[#3d4f46]">
                {preview.trim()}
              </pre>
            ) : (
              <p className="text-sm text-[#5a7a68]">请核对上面的说明后再决定。</p>
            )}
          </div>

          <div
            className={cn(
              "shrink-0 border-t px-4 py-3",
              danger ? "border-red-100 bg-red-50/60" : "border-[#1a5632]/12 bg-[#f6f8f6]",
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                variant={danger ? "destructive" : "default"}
                className="h-9 flex-1 text-xs"
                disabled={confirmDisabled}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 flex-1 text-xs"
                onClick={onCancel}
              >
                先不改
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
