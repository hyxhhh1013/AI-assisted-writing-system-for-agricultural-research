"use client";

import { Send, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const FALLBACK_WRITE = [
  "看看项目卡在哪",
  "写引言并保存",
  "先生成大纲我确认后再写",
] as const;

const FALLBACK_READ = [
  "看看项目卡在哪",
  "检索相关文献并总结缺口",
  "检查当前引用",
] as const;

interface AgentInputBarProps {
  disabled?: boolean;
  isRunning?: boolean;
  writeEnabled?: boolean;
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
    if (!trimmed || disabled || isRunning) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="shrink-0 border-t border-border/50 bg-white/95 px-4 pb-3.5 pt-2.5">
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 shrink-0 rounded-full px-3 text-[11px] font-normal"
            disabled={disabled || isRunning}
            onClick={() => onSend(prompt)}
          >
            {prompt.length > 22 ? `${prompt.slice(0, 22)}…` : prompt}
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="跟助手说你想做什么…（Enter 发送，Shift+Enter 换行）"
          className="min-h-[48px] max-h-36 flex-1 resize-none rounded-xl border-border/60 bg-[#fafaf8] text-[13.5px] leading-relaxed"
          rows={2}
          disabled={disabled || isRunning}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {isRunning ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            onClick={onCancel}
            aria-label="停止"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            disabled={disabled || !value.trim()}
            onClick={submit}
            aria-label="发送"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
