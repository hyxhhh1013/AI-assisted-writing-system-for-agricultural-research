"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentHitlBanner } from "@/components/shared/agent/agent-hitl-banner";
import { cn } from "@/lib/utils";
import {
  OUTLINE_REVISE_CHIPS,
  countOutlineChars,
  outlineHeadingChips,
  outlineLevelLabel,
  pickOutlineBody,
  splitOutlineBlocks,
} from "@/lib/agent/outline-review";

interface AgentOutlineReviewProps {
  preview?: string;
  projectOutline?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onRevise: (note?: string) => void;
  onOpenOutlineTab?: () => void;
  onSaveOutline?: (markdown: string) => Promise<void>;
}

export function AgentOutlineReview({
  preview,
  projectOutline,
  open,
  onOpenChange,
  onApprove,
  onRevise,
  onOpenOutlineTab,
  onSaveOutline,
}: AgentOutlineReviewProps) {
  const markdown = pickOutlineBody(preview, projectOutline);
  const [draft, setDraft] = useState(markdown);
  const [mode, setMode] = useState<"view" | "edit" | "agent">("view");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "view") setDraft(markdown);
  }, [markdown, mode]);

  const liveMarkdown = mode === "edit" ? draft : markdown;
  const blocks = useMemo(() => splitOutlineBlocks(liveMarkdown), [liveMarkdown]);
  const chips = useMemo(() => outlineHeadingChips(blocks), [blocks]);
  const chars = countOutlineChars(liveMarkdown);
  const headingCount = chips.length;
  const dirty = draft.trim() !== markdown.trim();

  const submitRevise = () => {
    onRevise(note.trim() || undefined);
    setMode("view");
    setNote("");
  };

  const persistDraft = async (): Promise<boolean> => {
    if (!onSaveOutline) return true;
    if (!dirty) return true;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveOutline(draft);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (mode === "edit" && dirty) {
      const ok = await persistDraft();
      if (!ok) return;
    }
    onApprove();
  };

  return (
    <>
      <div className="rounded-xl border border-[#1a5632]/18 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(26,86,50,0.04)]">
        <AgentHitlBanner
          eyebrow="需要你拍板 · 写作已暂停"
          title="一起过目这份大纲"
          detail={`${headingCount > 0 ? `${headingCount} 个标题` : "全文"}${chars > 0 ? ` · 约 ${chars} 字` : ""}。这是唯一的结构确认，可直接改标题。`}
        />
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => onOpenChange(true)}
          >
            打开过目页
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => {
              setMode("edit");
              setDraft(markdown);
              onOpenChange(true);
            }}
          >
            直接编辑
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(92vh,52rem)] w-[min(100%-1.5rem,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          <DialogHeader className="shrink-0 border-b border-[#1a5632]/10 bg-[#f6f8f6] px-5 py-4 pr-12 text-left">
            <p className="text-[10px] font-medium tracking-wide text-[#1a5632]">
              人控节点 · 你过目之后我才往下写
            </p>
            <DialogTitle className="mt-1 text-base text-[#122820]">
              一起确认大纲
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed text-[#5a7a68]">
              这里确认的是章节目录（一级 / 二级标题）。各节主张会按这份结构自动生成，不再单独弹「蓝图」。
              可直接改 Markdown；也可以让我按意见重排。
            </DialogDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#5a7a68]">
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-[#1a5632]/12">
                {headingCount > 0 ? `${headingCount} 个标题` : "未识别出标题"}
              </span>
              {chars > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-[#1a5632]/12">
                  约 {chars} 字
                </span>
              ) : null}
              {onOpenOutlineTab ? (
                <button
                  type="button"
                  className="text-[#1a5632] underline-offset-2 hover:underline"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenOutlineTab();
                  }}
                >
                  在论证提纲页打开
                </button>
              ) : null}
            </div>
          </DialogHeader>

          {mode !== "edit" && chips.length > 0 ? (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[#1a5632]/8 bg-white px-4 py-2">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] ring-1 ring-[#1a5632]/12",
                    chip.level === 1
                      ? "bg-[#1a5632] text-white ring-[#1a5632]"
                      : chip.level === 2
                        ? "bg-[#f6f8f6] text-[#122820]"
                        : "bg-white text-[#5a7a68]",
                  )}
                  onClick={() => {
                    document.getElementById(chip.id)?.scrollIntoView?.({
                      block: "start",
                      behavior: "smooth",
                    });
                  }}
                >
                  <span className="mr-1 opacity-70">{outlineLevelLabel(chip.level)}</span>
                  {chip.title}
                </button>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
            {mode === "edit" ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="大纲 Markdown"
                className="min-h-[22rem] resize-y bg-white font-mono text-[12.5px] leading-6"
              />
            ) : liveMarkdown ? (
              <article className="space-y-3">
                {blocks.map((block, i) =>
                  block.type === "heading" ? (
                    <div
                      key={block.id}
                      id={block.id}
                      className="scroll-mt-2"
                      style={{ paddingLeft: Math.max(0, block.level - 1) * 14 }}
                    >
                      <span
                        className={cn(
                          "mb-0.5 inline-block rounded px-1.5 py-px text-[10px] font-medium tracking-wide",
                          block.level === 1
                            ? "bg-[#1a5632] text-white"
                            : block.level === 2
                              ? "bg-[#1a5632]/12 text-[#1a5632]"
                              : "bg-[#eef2ef] text-[#5a7a68]",
                        )}
                      >
                        {outlineLevelLabel(block.level)}
                      </span>
                      {block.level <= 1 ? (
                        <h2 className="mt-1 text-[16px] font-semibold leading-snug text-[#122820]">
                          {block.title}
                        </h2>
                      ) : block.level === 2 ? (
                        <h3 className="mt-1 text-[14.5px] font-semibold leading-snug text-[#122820]">
                          {block.title}
                        </h3>
                      ) : (
                        <h4 className="mt-1 text-[13px] font-medium leading-snug text-[#3d4f46]">
                          {block.title}
                        </h4>
                      )}
                    </div>
                  ) : (
                    <p
                      key={`b-${i}`}
                      className="whitespace-pre-wrap text-[13px] leading-7 text-[#3d4f46]"
                      style={{ paddingLeft: 14 }}
                    >
                      {block.text}
                    </p>
                  ),
                )}
              </article>
            ) : (
              <p className="text-sm text-[#5a7a68]">大纲正文还没过来，可先打开论证提纲页查看。</p>
            )}
          </div>

          <div className="shrink-0 border-t border-[#1a5632]/12 bg-[#f6f8f6] px-4 py-3">
            {mode === "agent" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {OUTLINE_REVISE_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#122820] ring-1 ring-[#1a5632]/14 hover:bg-[#1a5632]/5"
                      onClick={() => setNote((prev) => (prev.trim() ? `${prev.trim()}\n${chip.note}` : chip.note))}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="想怎么改结构？可点上方快捷意见，也可以直接写。"
                  className="min-h-[72px] resize-none bg-white text-xs"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="h-8 flex-1 text-xs" onClick={submitRevise}>
                    提交修改意见
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => {
                      setMode("view");
                      setNote("");
                    }}
                  >
                    返回
                  </Button>
                </div>
              </div>
            ) : mode === "edit" ? (
              <div className="space-y-2">
                {saveError ? <p className="text-[11px] text-red-700">{saveError}</p> : null}
                <p className="text-[11px] text-[#5a7a68]">
                  用 # / ## / ### 区分一、二、三级标题。保存后会写回项目，再点批准即可。
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 flex-1 text-xs"
                    disabled={saving || !draft.trim()}
                    onClick={() => void approve()}
                  >
                    {saving ? "保存中…" : dirty ? "保存并批准" : "批准这份大纲，继续"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs"
                    disabled={saving || !dirty}
                    onClick={() => void persistDraft()}
                  >
                    仅保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 text-xs"
                    disabled={saving}
                    onClick={() => {
                      setDraft(markdown);
                      setMode("view");
                      setSaveError(null);
                    }}
                  >
                    取消编辑
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" size="sm" className="h-9 flex-1 text-xs" onClick={() => void approve()}>
                  批准这份大纲，继续
                </Button>
                {onSaveOutline ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 flex-1 text-xs"
                    onClick={() => {
                      setDraft(markdown);
                      setMode("edit");
                    }}
                  >
                    直接编辑
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 text-xs"
                  onClick={() => setMode("agent")}
                >
                  让 Agent 改
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
