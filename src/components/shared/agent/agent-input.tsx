"use client";

import { Loader2, Paperclip, Send, Square, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { clientRejectReason } from "@/lib/agent/attachments/client-validate";
import { deleteAgentAttachment, postAgentAttachment, postPinAttachment } from "@/services/agent";

/** 同时保留的最大附件数（与服务端 agentSchema.attachmentIds.max(20) 对齐） */
const MAX_ATTACHMENT_CHIPS = 20;

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

/** 附件-only 发送（无文本）时的默认 goal */
const ATTACHMENT_DEFAULT_GOAL = "请基于我上传的附件帮我处理";

interface AgentInputBarProps {
  disabled?: boolean;
  isRunning?: boolean;
  writeEnabled?: boolean;
  prompts?: string[];
  sessionId?: string;
  projectId?: string;
  onSend: (goal: string, opts?: { attachmentIds?: string[] }) => void;
  onCancel: () => void;
}

type Chip = {
  file: File;
  attachmentId: string | null;
  status: "uploading" | "extracting" | "ready" | "failed";
  error?: string;
  pinned: boolean;
  pinning?: boolean;
};

export function AgentInputBar({
  disabled,
  isRunning,
  writeEnabled,
  prompts,
  sessionId,
  projectId,
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
    if (chips.length >= MAX_ATTACHMENT_CHIPS) {
      toast.error(`最多同时上传 ${MAX_ATTACHMENT_CHIPS} 个附件`);
      return;
    }
    setChips((prev) => [
      ...prev,
      { file, attachmentId: null, status: "uploading", pinned: false },
    ]);
    try {
      const { attachment } = await postAgentAttachment(file, sessionId);
      const status: Chip["status"] =
        attachment.status === "ready"
          ? "ready"
          : attachment.status === "extracting"
            ? "extracting"
            : "failed";
      const error =
        attachment.status === "extract_failed" || attachment.status === "unsupported"
          ? "未能解析"
          : undefined;
      setChips((prev) =>
        prev.map((c) =>
          c.file === file
            ? { ...c, attachmentId: attachment.id, status, ...(error ? { error } : {}) }
            : c,
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

  /** 单次多选/拖拽同时加入多个文件：按剩余名额截断，超出提示（uploadFile 内另有兜底校验） */
  const enqueueFiles = (files: File[]) => {
    const available = Math.max(MAX_ATTACHMENT_CHIPS - chips.length, 0);
    for (const file of files.slice(0, available)) void uploadFile(file);
    if (files.length > available) {
      toast.error(`最多同时上传 ${MAX_ATTACHMENT_CHIPS} 个附件`);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      enqueueFiles(Array.from(files));
    }
    e.target.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (disabled || isRunning) return;
    const files = e.dataTransfer.files;
    if (files) {
      enqueueFiles(Array.from(files));
    }
  };

  const removeChip = (chip: Chip) => {
    // 已上传的附件同步删除服务端记录与磁盘文件；未上传的仅移除本地
    if (chip.attachmentId) {
      void deleteAgentAttachment(chip.attachmentId, sessionId).catch(() => {
        toast.error(`${chip.file.name}：删除失败（已保留）`);
      });
    }
    setChips((prev) => prev.filter((c) => c !== chip));
  };

  /** 固定附件到当前项目（跨会话可发现）；成功后置 pinned，失败 toast 报错 */
  const pinChip = async (chip: Chip) => {
    if (!chip.attachmentId || !projectId || chip.pinned || chip.pinning) return;
    setChips((prev) =>
      prev.map((c) => (c.file === chip.file ? { ...c, pinning: true } : c)),
    );
    try {
      await postPinAttachment(chip.attachmentId, projectId);
      setChips((prev) =>
        prev.map((c) =>
          c.file === chip.file ? { ...c, pinned: true, pinning: false } : c,
        ),
      );
    } catch (error) {
      setChips((prev) =>
        prev.map((c) => (c.file === chip.file ? { ...c, pinning: false } : c)),
      );
      toast.error(error instanceof Error ? error.message : "固定失败");
    }
  };

  /** 携带已就绪附件发送：附件-only 时用默认 goal 兜底 */
  const sendWithAttachments = (goal: string) => {
    onSend(goal, {
      attachmentIds: readyChips.map((c) => c.attachmentId!),
    });
    setChips([]);
  };

  const submit = () => {
    const trimmed = value.trim();
    if ((!trimmed && readyChips.length === 0) || disabled || isRunning) return;
    sendWithAttachments(trimmed || ATTACHMENT_DEFAULT_GOAL);
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
            onClick={() => {
              sendWithAttachments(prompt);
              setValue("");
            }}
          >
            {prompt.length > 22 ? `${prompt.slice(0, 22)}…` : prompt}
          </Button>
        ))}
      </div>
      {chips.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={`${chip.file.name}-${chip.file.size}`}
              className="inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-full border border-border/60 bg-white px-2.5 text-[11px] text-[#3d4f46]"
            >
              <span className="max-w-[140px] truncate" title={chip.file.name}>
                {chip.file.name}
              </span>
              {chip.status === "uploading" || chip.status === "extracting" ? (
                <span
                  className="inline-flex shrink-0"
                  title={chip.status === "extracting" ? "解析中…" : "上传中…"}
                >
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                </span>
              ) : chip.status === "failed" ? (
                <span className="max-w-[120px] truncate text-red-600" title={chip.error}>
                  {chip.error ?? "上传失败"}
                </span>
              ) : null}
              {chip.status === "ready" && chip.attachmentId && projectId ? (
                <button
                  type="button"
                  disabled={chip.pinned || chip.pinning}
                  onClick={() => void pinChip(chip)}
                  title={chip.pinned ? "已固定到项目" : "固定到项目"}
                  className={`shrink-0 rounded-full px-1.5 text-[10px] transition-colors ${
                    chip.pinned
                      ? "cursor-default text-muted-foreground"
                      : "text-[#3d4f46] hover:bg-black/5"
                  }`}
                >
                  {chip.pinned ? "已固定" : chip.pinning ? "固定中…" : "固定"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => removeChip(chip)}
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
