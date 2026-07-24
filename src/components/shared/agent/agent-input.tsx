"use client";

import { Loader2, Send, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const FALLBACK_WRITE = [
  "写引言并保存到当前项目",
  "写方法部分并保存到当前项目",
  "检索相关文献并总结研究缺口",
] as const;

const FALLBACK_READ = [
  "分析这个方向有什么可写的",
  "检索生物炭土壤改良相关文献",
  "检查当前项目引用的准确性",
] as const;

interface AgentInputBarProps {
  disabled?: boolean;
  isRunning?: boolean;
  writeEnabled?: boolean;
  /** 按项目阶段动态生成的快捷语；缺省用内置兜底 */
  prompts?: string[];
  onSend: (goal: string) => void;
  onCancel: () => void;
}

export function AgentInputBar({
  disabled,
  isRunning,
  writeEnabled,
  prompts,
  onSend,
  onCancel,
}: AgentInputBarProps) {
  const [value, setValue] = useState("");
  const chips =
    prompts && prompts.length > 0
      ? prompts
      : writeEnabled
        ? [...FALLBACK_WRITE]
        : [...FALLBACK_READ];

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="space-y-2 border-t border-border/60 bg-background p-3">
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
        {chips.map((prompt) => (
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
          placeholder={
            writeEnabled
              ? "例如：写引言并保存到当前项目；或先检索 XX 再写讨论"
              : "描述目标，例如：检索 XX 主题文献并总结研究缺口"
          }
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
