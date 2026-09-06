"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  REINDEX_PIPELINE_STEPS,
  reindexStepStatus,
  type ReindexProgressState,
} from "@/contracts/reindex";
import { Check, Loader2, Minus, X } from "lucide-react";

interface KnowledgeReindexProgressProps {
  isIndexing: boolean;
  panelOpen: boolean;
  indexProgress: ReindexProgressState;
  onCancel: () => void;
  onDismiss: () => void;
}

export function KnowledgeReindexProgress({
  isIndexing,
  panelOpen,
  indexProgress,
  onCancel,
  onDismiss,
}: KnowledgeReindexProgressProps) {
  if (!panelOpen && !isIndexing) return null;

  const terminal = indexProgress.pipelineStage === "done" || indexProgress.failed;
  const barClass =
    indexProgress.failed
      ? "w-full min-w-0 flex-nowrap [&>[data-slot=progress-track]]:h-2 [&>[data-slot=progress-track]_[data-slot=progress-indicator]]:bg-destructive"
      : "w-full min-w-0 flex-nowrap [&>[data-slot=progress-track]]:h-2";

  return (
    <Card className={indexProgress.failed ? "border-destructive/40 bg-destructive/5" : "border-primary/50 bg-primary/5"}>
      <CardContent className="pt-6 space-y-4">
        <ol className="grid grid-cols-3 gap-3">
          {REINDEX_PIPELINE_STEPS.map((step, i) => {
            const status = reindexStepStatus(step.id, indexProgress);
            return (
              <li key={step.id} className="min-w-0 flex items-start gap-2">
                <StepDot status={status} index={i + 1} />
                <div className="min-w-0">
                  <p className={`text-xs font-medium truncate ${stepLabelClass(status)}`}>
                    {step.label}
                    {status === "skipped" ? "（跳过）" : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{step.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <span className="text-sm font-medium">{indexProgress.phase || "正在更新索引…"}</span>
            {indexProgress.currentFile && (
              <p className="text-xs text-muted-foreground truncate" title={indexProgress.currentFile}>
                当前文件：{indexProgress.currentFile}
              </p>
            )}
            {indexProgress.totalFiles > 0 && (
              <p className="text-xs text-muted-foreground">
                文献 {indexProgress.processedFiles}/{indexProgress.totalFiles}
                {indexProgress.unchangedCount > 0 && ` · ${indexProgress.unchangedCount} 篇跳过`}
                {indexProgress.changedCount > 0 && ` · ${indexProgress.changedCount} 篇需更新`}
              </p>
            )}
            {indexProgress.embedTotal > 0 && !indexProgress.embedSkipped && (
              <p className="text-xs text-muted-foreground">
                向量批次 {indexProgress.embedCurrent}/{indexProgress.embedTotal}
              </p>
            )}
            {indexProgress.errorMessage && (
              <p className="text-xs text-destructive break-words">{indexProgress.errorMessage}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-mono text-muted-foreground tabular-nums">{indexProgress.percent}%</span>
            {isIndexing && !terminal ? (
              <Button variant="outline" size="sm" onClick={onCancel}>
                取消
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onDismiss}>
                关闭
              </Button>
            )}
          </div>
        </div>
        <Progress value={indexProgress.percent} className={barClass} />
        {indexProgress.logs.length > 0 && (
          <div className="rounded-md border bg-background/70 p-3 max-h-48 overflow-y-auto">
            <ul className="space-y-1 text-xs text-muted-foreground font-mono">
              {indexProgress.logs.map((line, i) => (
                <li key={`${i}-${line}`} className="break-all">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function stepLabelClass(status: ReturnType<typeof reindexStepStatus>): string {
  if (status === "current") return "text-primary";
  if (status === "error") return "text-destructive";
  if (status === "pending") return "text-muted-foreground";
  return "text-foreground";
}

function StepDot({
  status,
  index,
}: {
  status: ReturnType<typeof reindexStepStatus>;
  index: number;
}) {
  const base = "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] shrink-0";
  if (status === "done") {
    return (
      <span className={`${base} border-primary bg-primary text-primary-foreground`}>
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className={`${base} border-primary text-primary`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={`${base} border-destructive bg-destructive text-destructive-foreground`}>
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className={`${base} border-muted-foreground/40 text-muted-foreground`}>
        <Minus className="h-3.5 w-3.5" />
      </span>
    );
  }
  return <span className={`${base} border-muted-foreground/30 text-muted-foreground`}>{index}</span>;
}
