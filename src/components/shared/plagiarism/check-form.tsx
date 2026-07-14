"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FolderOpen, Globe, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlagiarismStage } from "@/hooks/use-plagiarism-check";

interface ProjectOption {
  id: string;
  title: string;
}

export interface PlagiarismCheckFormProps {
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  webSearch: boolean;
  setWebSearch: (v: boolean) => void;
  checking: boolean;
  stage: PlagiarismStage | null;
  error?: string | null;
  onCheck: () => void;
  onCancel?: () => void;
  onClear: () => void;
  plist?: ProjectOption[];
  selPid?: string;
  loadingP?: boolean;
  onLoadProject?: (id: string) => void;
  compact?: boolean;
  maxContentLength?: number;
}

export function PlagiarismCheckForm({
  title,
  setTitle,
  content,
  setContent,
  webSearch,
  setWebSearch,
  checking,
  stage,
  error,
  onCheck,
  onCancel,
  onClear,
  plist,
  selPid = "",
  loadingP = false,
  onLoadProject,
  compact = false,
  maxContentLength = 100_000,
}: PlagiarismCheckFormProps) {
  const overLimit = content.length > maxContentLength;

  return (
    <div className={cn("flex flex-col", compact ? "h-full gap-1.5" : "h-full min-h-[420px] gap-3")}>
      {plist && onLoadProject && (
        <div className={cn("flex items-center rounded-lg border bg-muted/30", compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2.5")}>
          <FolderOpen className={cn("shrink-0 text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <select
            className={cn("flex-1 bg-transparent outline-none", compact ? "text-xs" : "text-sm")}
            value={selPid}
            onChange={(e) => onLoadProject(e.target.value)}
            disabled={loadingP}
          >
            <option value="">选择已有项目导入内容...</option>
            {plist.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {loadingP && <Loader2 className={cn("animate-spin text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />}
        </div>
      )}

      <input
        type="text"
        className={cn(
          "w-full rounded-lg border bg-background outline-none focus:ring-1 focus:ring-primary/20",
          compact ? "px-2 py-1.5 text-xs" : "px-3 py-2.5 text-sm",
        )}
        placeholder={compact ? "检测标题" : "检测标题（选填）"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className={cn("relative flex min-h-0 flex-1 flex-col", compact ? "" : "")}>
        <Textarea
          className={cn(
            "flex-1 resize-none leading-relaxed",
            compact ? "h-full font-mono text-xs" : "min-h-[280px] pr-16 text-sm",
          )}
          placeholder="在此粘贴论文内容，或从上方选择项目导入..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {!compact && (
          <span className="absolute bottom-3 right-4 text-[10px] tabular-nums text-muted-foreground">
            {content.length.toLocaleString()} 字
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <div className={cn("flex shrink-0 items-center justify-between", compact ? "" : "border-t pt-3")}>
        <label className={cn("flex cursor-pointer items-center text-muted-foreground", compact ? "gap-1.5 text-xs" : "gap-2 text-sm")}>
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} className="rounded" />
          <Globe className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {compact ? "联网" : "联网搜索"}
        </label>
        <div className="flex items-center gap-2">
          {compact && (
            <span className={cn("text-[10px] tabular-nums", overLimit ? "text-red-600" : "text-muted-foreground")}>
              {content.length.toLocaleString()}
            </span>
          )}
          <Button variant="ghost" size="sm" className={compact ? "h-7 text-xs" : ""} onClick={onClear}>
            清空
          </Button>
          {checking && onCancel && (
            <Button variant="ghost" size="sm" className={compact ? "h-7 text-xs" : ""} onClick={onCancel}>
              取消
            </Button>
          )}
          <Button
            size="sm"
            className={compact ? "h-7 text-xs" : ""}
            onClick={onCheck}
            disabled={checking || !content.trim() || overLimit}
          >
            {checking ? (
              <>
                <Loader2 className={cn("animate-spin", compact ? "mr-1 h-3 w-3" : "mr-1.5 h-4 w-4")} />
                {stage?.label ?? "检测中..."}
              </>
            ) : (
              <>
                <Search className={cn(compact ? "mr-1 h-3 w-3" : "mr-1.5 h-4 w-4")} />
                {compact ? "查重" : "开始查重"}
              </>
            )}
          </Button>
        </div>
      </div>

      {checking && stage && (
        <div className={cn("rounded-lg border border-[#1a5632]/15 bg-[#1a5632]/5", compact ? "px-2 py-2" : "px-3 py-2.5")}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={cn("text-[#1a5632]", compact ? "text-[10px]" : "text-xs")}>{stage.label}</span>
            <Loader2 className={cn("animate-spin text-[#1a5632]", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[#1a5632]/10">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-[#1a5632]/50" />
          </div>
        </div>
      )}
    </div>
  );
}
