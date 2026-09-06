"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DIALOG_FORM } from "@/components/ui/dialog-sizes";
import { siteTheme } from "@/lib/site-theme";
import {
  buildKnowledgeIndexRequest,
  KNOWLEDGE_INDEX_JOBS,
  type KnowledgeIndexJob,
  type ReindexRequest,
} from "@/contracts/reindex";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";

interface KnowledgeReindexMenuProps {
  disabled?: boolean;
  isIndexing?: boolean;
  files?: string[];
  onRun: (request: ReindexRequest, startMessage: string) => void;
  variant?: "page" | "batch";
}

export function KnowledgeReindexMenu({
  disabled,
  isIndexing,
  files,
  onRun,
  variant = "page",
}: KnowledgeReindexMenuProps) {
  const [pending, setPending] = useState<KnowledgeIndexJob | null>(null);
  const busy = disabled || isIndexing;
  const scoped = (files?.length ?? 0) > 0;
  const defaultJob = KNOWLEDGE_INDEX_JOBS[0];

  const startJob = (job: KnowledgeIndexJob) => {
    const built = buildKnowledgeIndexRequest(job.id, files);
    if (built.error) {
      toast.error(built.error);
      return;
    }
    const startMessage = scoped
      ? `正在${job.label}（${files!.length} 篇）…`
      : job.startMessage;
    onRun(built.request, startMessage);
  };

  const pickJob = (job: KnowledgeIndexJob) => {
    if (job.needsConfirm) setPending(job);
    else startJob(job);
  };

  const confirmLabel = pending
    ? scoped
      ? `确认${pending.label}（${files!.length} 篇）`
      : pending.confirmTitle.replace("？", "")
    : "";

  if (variant === "batch") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            render={
              <Button variant="ghost" size="sm" className="text-xs h-8" disabled={busy}>
                {isIndexing ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                索引所选
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuGroup>
              <DropdownMenuLabel>对已选 {files?.length ?? 0} 篇</DropdownMenuLabel>
              {KNOWLEDGE_INDEX_JOBS.map((job) => (
                <IndexJobItem key={job.id} job={job} onSelect={pickJob} />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmIndexDialog
          job={pending}
          confirmLabel={confirmLabel}
          scopedCount={files?.length}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (!pending) return;
            const job = pending;
            setPending(null);
            startJob(job);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex shrink-0">
        <Button
          onClick={() => pickJob(defaultJob)}
          disabled={busy}
          className={`rounded-r-none ${siteTheme.btnPrimary}`}
        >
          {isIndexing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {defaultJob.label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            render={
              <Button
                disabled={busy}
                aria-label="更多索引任务"
                className={`rounded-l-none border-l border-white/25 px-2 ${siteTheme.btnPrimary}`}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuGroup>
              <DropdownMenuLabel>索引任务</DropdownMenuLabel>
              <IndexJobItem job={defaultJob} onSelect={pickJob} />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {KNOWLEDGE_INDEX_JOBS.filter((job) => job.id !== defaultJob.id).map((job) => (
                <IndexJobItem key={job.id} job={job} onSelect={pickJob} />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmIndexDialog
        job={pending}
        confirmLabel={confirmLabel}
        scopedCount={files?.length}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          const job = pending;
          setPending(null);
          startJob(job);
        }}
      />
    </>
  );
}

function IndexJobItem({
  job,
  onSelect,
}: {
  job: KnowledgeIndexJob;
  onSelect: (job: KnowledgeIndexJob) => void;
}) {
  return (
    <DropdownMenuItem
      variant={job.destructive ? "destructive" : "default"}
      className="flex-col items-start gap-0.5 py-2"
      onClick={() => onSelect(job)}
    >
      <span className="font-medium">{job.label}</span>
      <span className="text-xs text-muted-foreground whitespace-normal leading-snug">{job.description}</span>
    </DropdownMenuItem>
  );
}

function ConfirmIndexDialog({
  job,
  confirmLabel,
  scopedCount,
  onCancel,
  onConfirm,
}: {
  job: KnowledgeIndexJob | null;
  confirmLabel: string;
  scopedCount?: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={job != null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className={DIALOG_FORM}>
        <DialogHeader>
          <DialogTitle>{job?.confirmTitle}</DialogTitle>
          <DialogDescription>
            {scopedCount ? `范围：已选 ${scopedCount} 篇。` : "范围：知识库全部文献。"}
            {" "}
            {job?.confirmBody}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button variant={job?.destructive ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel || "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
