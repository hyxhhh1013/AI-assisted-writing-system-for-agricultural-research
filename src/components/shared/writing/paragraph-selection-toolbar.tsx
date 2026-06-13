"use client";

import { Button } from "@/components/ui/button";
import { FileText, Minimize2, Sparkles, Wand2 } from "lucide-react";

export type ParagraphSelectionAction = "expand" | "polish" | "audit" | "shorten";

interface ParagraphSelectionToolbarProps {
  disabled?: boolean;
  onAction: (action: ParagraphSelectionAction) => void;
}

export function ParagraphSelectionToolbar({ disabled, onAction }: ParagraphSelectionToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-primary/20 bg-background/95 px-2 py-1.5 shadow-sm">
      <span className="text-[10px] text-muted-foreground mr-1">选区助手</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-[10px] text-primary"
        disabled={disabled}
        onClick={() => onAction("expand")}
      >
        <Sparkles className="h-3 w-3" />
        扩写
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-[10px]"
        disabled={disabled}
        onClick={() => onAction("polish")}
      >
        <Wand2 className="h-3 w-3" />
        润色
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-[10px] text-amber-700"
        disabled={disabled}
        onClick={() => onAction("audit")}
      >
        <FileText className="h-3 w-3" />
        审查
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-[10px]"
        disabled={disabled}
        onClick={() => onAction("shorten")}
      >
        <Minimize2 className="h-3 w-3" />
        精简
      </Button>
    </div>
  );
}
