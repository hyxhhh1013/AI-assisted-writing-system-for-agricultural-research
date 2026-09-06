"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Tag, Trash2 } from "lucide-react";
import type { UseKnowledgeListReturn } from "@/hooks/use-knowledge-list";
import { KnowledgeReindexMenu } from "@/components/shared/knowledge/knowledge-reindex-menu";

type PickKb = Pick<
  UseKnowledgeListReturn,
  | "selectedFiles"
  | "setSelectedFiles"
  | "setIsBatchMoveOpen"
  | "handleBatchDelete"
  | "isBatchProcessing"
  | "isIndexing"
  | "handleIndexJob"
> & { canDeleteKnowledge?: boolean };

export function KnowledgeBatchToolbar(kb: PickKb) {
  if (kb.selectedFiles.length === 0) return null;

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between sticky top-4 z-10 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold text-primary">已选中 {kb.selectedFiles.length} 项</span>
        <div className="h-4 w-px bg-primary/20" />
        <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => kb.setIsBatchMoveOpen(true)}>
          <Tag className="mr-2 h-3.5 w-3.5" /> 批量分类
        </Button>
        <KnowledgeReindexMenu
          variant="batch"
          isIndexing={kb.isIndexing}
          files={kb.selectedFiles.map((f) => f.name)}
          onRun={kb.handleIndexJob}
        />
        {kb.canDeleteKnowledge && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={kb.handleBatchDelete}
            disabled={kb.isBatchProcessing}
          >
            {kb.isBatchProcessing ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-3.5 w-3.5" />
            )}
            批量删除
          </Button>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => kb.setSelectedFiles([])}>
        取消选择
      </Button>
    </div>
  );
}
