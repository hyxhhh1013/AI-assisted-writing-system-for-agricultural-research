"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, BookOpen, Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AnalyzeMode } from "@/contracts/knowledge-analyze";
import { useKnowledgeAnalyze } from "@/hooks/use-knowledge-analyze";

interface KnowledgeAnalyzePanelProps {
  filename: string;
  parseWarning?: "no_text" | "low_text" | null;
}

export function KnowledgeAnalyzePanel({ filename, parseWarning }: KnowledgeAnalyzePanelProps) {
  const { text, meta, isAnalyzing, error, analyze, cancel, reset } = useKnowledgeAnalyze();

  useEffect(() => {
    reset();
  }, [filename, reset]);

  const hasNoText = parseWarning === "no_text";

  const runAnalyze = async (mode: AnalyzeMode, chunkIndex?: number) => {
    try {
      await analyze({ filename, mode, chunkIndex: chunkIndex ?? 0 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分析失败");
    }
  };

  if (hasNoText) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <AlertTriangle className="h-10 w-10 text-amber-500/80" />
        <p className="text-sm font-medium">该 PDF 未提取到可索引文本</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px]">
          可能是扫描版。请回到知识库换用带文字层的 PDF，或 OCR 后执行「强制重解析」，再回来分析。
        </p>
      </div>
    );
  }

  const totalChunks = meta?.totalChunks ?? 1;
  const currentChunk = meta?.currentChunk ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            AI 精读
          </Label>
          {parseWarning === "low_text" && (
            <Badge variant="secondary" className="text-[10px]">
              文本较少
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 text-xs"
            disabled={isAnalyzing}
            onClick={() => void runAnalyze("full")}
          >
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            全文摘要
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            disabled={isAnalyzing}
            onClick={() => void runAnalyze("chunk", currentChunk)}
          >
            分段精读
          </Button>
        </div>
        {meta && meta.mode === "chunk" && totalChunks > 1 && (
          <div className="flex items-center gap-2">
            <Select
              value={String(currentChunk)}
              onValueChange={(val) => void runAnalyze("chunk", Number(val))}
              disabled={isAnalyzing}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择分段" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: totalChunks }, (_, i) => (
                  <SelectItem key={i} value={String(i)} className="text-xs">
                    第 {i + 1} / {totalChunks} 段
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {isAnalyzing && (
          <Button size="sm" variant="ghost" className="w-full text-xs h-7" onClick={cancel}>
            取消
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {error && !isAnalyzing && (
          <p className="text-xs text-destructive mb-3">{error}</p>
        )}
        {!text && !isAnalyzing && (
          <p className="text-xs text-muted-foreground text-center py-12">
            点击「全文摘要」或「分段精读」开始 AI 分析
          </p>
        )}
        {(text || isAnalyzing) && (
          <div className="space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {meta?.mode === "full"
                  ? "全文模式"
                  : meta
                    ? `分段 ${currentChunk + 1}/${totalChunks}`
                    : "分析中"}
              </span>
              {text && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    void navigator.clipboard.writeText(text);
                    toast.success("已复制");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-xs leading-relaxed">
              {text}
              {isAnalyzing && (
                <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary animate-pulse align-middle" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
