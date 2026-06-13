"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, CheckCircle2 } from "lucide-react";
import type { RetrievePreviewHit } from "@/contracts/writing-retrieve-preview";

interface WritingSourcePickerProps {
  hits: RetrievePreviewHit[];
  selectedSourceIds: string[];
  previewQuery: string;
  loading: boolean;
  confirmed: boolean;
  fetchedOnce: boolean;
  fetchError?: string | null;
  previewStale?: boolean;
  onToggle: (sourceKey: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
}

export function WritingSourcePicker({
  hits,
  selectedSourceIds,
  previewQuery,
  loading,
  confirmed,
  fetchedOnce,
  fetchError,
  previewStale,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onConfirm,
}: WritingSourcePickerProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在检索知识库…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive leading-relaxed">
        文献检索失败：{fetchError}
      </div>
    );
  }

  if (!fetchedOnce) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground leading-relaxed">
        点击「检索文献」预览 RAG 命中结果；仅选中来源会进入 [1]…[N] 引用池。
      </div>
    );
  }

  if (previewStale) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
        扩写要点或补充说明已变更，请重新点击「检索文献」更新预览后再确认。
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground leading-relaxed">
        未命中相关 PDF 片段。确认后可继续扩写（AI 不会获得 RAG 原文上下文）。
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-medium flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            勾选参与扩写的文献（{selectedSourceIds.length}/{hits.length}）
          </p>
          {previewQuery && (
            <p className="text-[10px] text-muted-foreground line-clamp-2" title={previewQuery}>
              检索词：{previewQuery}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onSelectAll}>
            全选
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onDeselectAll}>
            清空
          </Button>
        </div>
      </div>

      <ul className="max-h-48 space-y-2 overflow-y-auto custom-scrollbar pr-1">
        {hits.map((hit) => {
          const checked = selectedSourceIds.includes(hit.sourceKey);
          const labelId = `source-${hit.sourceKey.replace(/[^\w.-]/g, "_")}`;
          return (
            <li
              key={hit.sourceKey}
              className="flex gap-2 rounded border bg-background/80 p-2 text-xs leading-relaxed"
            >
              <Checkbox
                id={labelId}
                checked={checked}
                onCheckedChange={(v) => onToggle(hit.sourceKey, v === true)}
                className="mt-0.5"
              />
              <label htmlFor={labelId} className="flex-1 cursor-pointer space-y-1">
                <div className="flex flex-wrap items-center gap-1">
                  {hit.refIndex != null && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      [{hit.refIndex}]
                    </Badge>
                  )}
                  {hit.isNew && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary">
                      新
                    </Badge>
                  )}
                  <span className="font-medium">{hit.displayName}</span>
                </div>
                {(hit.bib?.firstAuthor || hit.bib?.year || hit.bib?.journal) && (
                  <p className="text-[10px] text-muted-foreground">
                    {[hit.bib?.firstAuthor, hit.bib?.year ? `(${hit.bib.year})` : "", hit.bib?.journal]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground line-clamp-2">{hit.snippet}</p>
              </label>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        size="sm"
        variant={confirmed ? "secondary" : "default"}
        className="w-full text-xs"
        disabled={selectedSourceIds.length === 0}
        onClick={onConfirm}
      >
        {confirmed ? (
          <>
            <CheckCircle2 className="mr-1 h-3 w-3" /> 已确认文献选择
          </>
        ) : (
          "确认文献选择"
        )}
      </Button>
    </div>
  );
}
