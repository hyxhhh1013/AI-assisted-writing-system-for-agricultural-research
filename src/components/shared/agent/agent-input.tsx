"use client";

import { Loader2, Paperclip, Send, Square, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { clientRejectReason } from "@/lib/agent/attachments/client-validate";
import { postAgentAttachment } from "@/services/agent";

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
  sessionId?: string;
  onSend: (goal: string, opts?: { attachmentIds?: string[] }) => void;
  onCancel: () => void;
}

type Chip = {
  file: File;
  attachmentId: string | null;
  status: "uploading" | "ready" | "failed";
  error?: string;
};

export function AgentInputBar({
  disabled,
  isRunning,
  writeEnabled,
  prompts,
  sessionId,
  onSend,
  onCancel,
}: AgentInputBarProps) {
  const [value, setValue] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipsFallback =
    prompts && prompts.length > 0
      ? prompts
      : writeEnabled
        ? [...FALLBACK_WRITE]
        : [...FALLBACK_READ];

  const readyChips = chips.filter((c) => c.status === "ready" && c.attachmentId);

  const uploadFile = async (file: File) => {
    const reason = clientRejectReason(file);
    if (reason) {
      toast.error(`${file.name}：${reason}`);
      return;
    }
    setChips((prev) => [...prev, { file, attachmentId: null, status: "uploading" }]);
    try {
      const { attachment } = await postAgentAttachment(file, sessionId);
      setChips((prev) =>
        prev.map((c) =>
          c.file === file ? { ...c, attachmentId: attachment.id, status: "ready" } : c,
        ),
      );
    } catch (error) {
      setChips((prev) =>
        prev.map((c) =>
          c.file === file
            ? { ...c, status: "failed", error: error instanceof Error ? error.message : "上传失败" }
            : c,
        ),
      );
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) void uploadFile(file);
    }
    e.target.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files) {
      for (const file of Array.from(files)) void uploadFile(file);
    }
  };

  const removeChip = (index: number) => {
    setChips((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = () => {
    const trimmed = value.trim();
    if ((!trimmed && readyChips.length === 0) || disabled || isRunning) return;
    onSend(trimmed, {
      attachmentIds: readyChips.map((c) => c.attachmentId!),
    });
    setChips([]);
    setValue("");
  };

  return (
    <div className="shrink-0 border-t border-border/50 bg-white/95 px-4 pb-3.5 pt-2.5">
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chipsFallback.map((prompt) => (
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
      {chips.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span
              key={`${chip.file.name}-${i}`}
              className="inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-full border border-border/60 bg-white px-2.5 text-[11px] text-[#3d4f46]"
            >
              <span className="max-w-[140px] truncate" title={chip.file.name}>
                {chip.file.name}
              </span>
              {chip.status === "uploading" ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
              ) : chip.status === "failed" ? (
                <span className="max-w-[120px] truncate text-red-600" title={chip.error}>
                  {chip.error ?? "上传失败"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removeChip(i)}
                aria-label="移除附件"
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-[#3d4f46]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div
        className="flex items-end gap-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.tex,.ris,.bib,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground hover:text-[#3d4f46]"
          disabled={disabled || isRunning}
          onClick={() => inputRef.current?.click()}
          aria-label="添加附件"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
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
            disabled={disabled || (!value.trim() && readyChips.length === 0)}
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
