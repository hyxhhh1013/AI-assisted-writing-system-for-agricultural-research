"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ReindexProgressState } from "@/contracts/reindex";

interface KnowledgeReindexProgressProps {
  isIndexing: boolean;
  indexProgress: ReindexProgressState;
  onCancel: () => void;
}

export function KnowledgeReindexProgress({ isIndexing, indexProgress, onCancel }: KnowledgeReindexProgressProps) {
  if (!isIndexing) return null;

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <span className="text-sm font-medium">{indexProgress.phase || "正在构建索引…"}</span>
            {indexProgress.currentFile && (
              <p className="text-xs text-muted-foreground truncate">当前文件：{indexProgress.currentFile}</p>
            )}
            {indexProgress.totalFiles > 0 && (
              <p className="text-xs text-muted-foreground">
                文献进度 {indexProgress.processedFiles}/{indexProgress.totalFiles}
                {indexProgress.unchangedCount > 0 && ` · ${indexProgress.unchangedCount} 个跳过`}
                {indexProgress.changedCount > 0 && ` · ${indexProgress.changedCount} 个需更新`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-mono text-muted-foreground">{indexProgress.percent}%</span>
            <Button variant="outline" size="sm" onClick={onCancel}>
              取消
            </Button>
          </div>
        </div>
        <Progress value={indexProgress.percent} className="h-2" />
        {indexProgress.logs.length > 0 && (
          <div className="rounded-md border bg-background/70 p-3 max-h-48 overflow-y-auto">
            <ul className="space-y-1 text-xs text-muted-foreground font-mono">
              {indexProgress.logs.map((line, i) => (
                <li key={`${line}-${i}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
