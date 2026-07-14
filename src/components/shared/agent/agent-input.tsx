"use client";

import { Loader2, Send, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const QUICK_PROMPTS = [
  "分析这个方向有什么可写的",
  "检索生物炭土壤改良相关文献",
  "检查当前项目引用的准确性",
] as const;

interface AgentInputBarProps {
  disabled?: boolean;
  isRunning?: boolean;
  onSend: (goal: string) => void;
  onCancel: () => void;
}

export function AgentInputBar({
  disabled,
  isRunning,
  onSend,
  onCancel,
}: AgentInputBarProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="space-y-2 border-t border-border/60 bg-background p-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={disabled || isRunning}
            onClick={() => onSend(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="描述你的目标，例如：检索 XX 主题文献并总结研究缺口"
          className="min-h-[72px] resize-none text-sm"
          disabled={disabled || isRunning}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex flex-col gap-2">
          {isRunning ? (
            <Button type="button" variant="destructive" size="icon" onClick={onCancel}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" size="icon" disabled={disabled || !value.trim()} onClick={submit}>
              <Send className="h-4 w-4" />
            </Button>
          )}
          {isRunning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>
    </div>
  );
}
