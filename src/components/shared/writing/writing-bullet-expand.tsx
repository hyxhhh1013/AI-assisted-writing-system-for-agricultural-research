"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, RotateCcw, Eye, EyeOff } from "lucide-react";

interface WritingBulletExpandProps {
  bulletIndex: number;
  totalBullets: number;
  bulletLabel: string;
  currentText: string;
  onCurrentTextChange: (text: string) => void;
  mergePreview: string;
  showMergePreview: boolean;
  onToggleMergePreview: () => void;
  isGenerating: boolean;
  onAdoptAndNext: () => void;
  onRewrite: () => void;
}

export function WritingBulletExpand({
  bulletIndex,
  totalBullets,
  bulletLabel,
  currentText,
  onCurrentTextChange,
  mergePreview,
  showMergePreview,
  onToggleMergePreview,
  isGenerating,
  onAdoptAndNext,
  onRewrite,
}: WritingBulletExpandProps) {
  const isLast = bulletIndex >= totalBullets - 1;

  return (
    <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold">逐条扩写（096c）</Label>
        <span className="text-[10px] text-muted-foreground">
          第 {bulletIndex + 1}/{totalBullets} 条
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        当前要点：{bulletLabel}
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">本条生成内容（可编辑后采纳）</Label>
        <Textarea
          className="text-xs min-h-[100px] max-h-[200px] resize-y"
          value={currentText}
          disabled={isGenerating}
          onChange={(e) => onCurrentTextChange(e.target.value)}
        />
      </div>
      {showMergePreview && (
        <div className="space-y-1.5">
          <Label className="text-xs">合并预览</Label>
          <Textarea
            readOnly
            className="text-xs min-h-[80px] max-h-[160px] resize-none bg-muted/30"
            value={mergePreview}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-7 text-[10px] flex-1 min-w-[120px]"
          disabled={isGenerating || !currentText.trim()}
          onClick={onAdoptAndNext}
        >
          {isGenerating ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Check className="mr-1 h-3 w-3" />
          )}
          {isLast ? "采纳并完成合并" : "采纳并写下一条"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px]"
          disabled={isGenerating}
          onClick={onRewrite}
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          重写本条
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[10px]"
          disabled={isGenerating}
          onClick={onToggleMergePreview}
        >
          {showMergePreview ? (
            <EyeOff className="mr-1 h-3 w-3" />
          ) : (
            <Eye className="mr-1 h-3 w-3" />
          )}
          {showMergePreview ? "隐藏预览" : "合并预览"}
        </Button>
      </div>
    </div>
  );
}
