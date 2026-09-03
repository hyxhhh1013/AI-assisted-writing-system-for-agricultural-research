"use client";

import { useMemo, useState } from "react";
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
}

export function AgentOutlineReview({
  preview,
  projectOutline,
  open,
  onOpenChange,
  onApprove,
  onRevise,
  onOpenOutlineTab,
}: AgentOutlineReviewProps) {
  const markdown = pickOutlineBody(preview, projectOutline);
  const blocks = useMemo(() => splitOutlineBlocks(markdown), [markdown]);
  const chips = useMemo(() => outlineHeadingChips(blocks), [blocks]);
  const chars = countOutlineChars(markdown);
  const headingCount = chips.length;
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");

  const submitRevise = () => {
    onRevise(note.trim() || undefined);
    setRevising(false);
    setNote("");
  };

  return (
    <>
      <div className="rounded-xl border border-[#1a5632]/18 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(26,86,50,0.04)]">
        <AgentHitlBanner
          eyebrow="需要你拍板 · 写作已暂停"
          title="一起过目这份大纲"
          detail={`${headingCount > 0 ? `${headingCount} 个章节` : "全文"}${chars > 0 ? ` · 约 ${chars} 字` : ""}。不批准我不会生成蓝图或写正文。`}
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
              setRevising(true);
              onOpenChange(true);
            }}
          >
            要改结构
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
              大纲已写入项目。请通读结构：批准后我会问下一步（蓝图或写某一节）；要改请留下意见，我会按你的意思重排。
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

          {chips.length > 0 ? (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[#1a5632]/8 bg-white px-4 py-2">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] ring-1 ring-[#1a5632]/12",
                    chip.level === 1
                      ? "bg-[#1a5632] text-white ring-[#1a5632]"
                      : "bg-[#f6f8f6] text-[#122820]",
                  )}
                  onClick={() => {
                    document.getElementById(chip.id)?.scrollIntoView?.({
                      block: "start",
                      behavior: "smooth",
                    });
                  }}
                >
                  {chip.title}
                </button>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
            {markdown ? (
              <article className="space-y-3">
                {blocks.map((block, i) =>
                  block.type === "heading" ? (
                    <h3
                      key={block.id}
                      id={block.id}
                      className={cn(
                        "scroll-mt-2 font-semibold text-[#122820]",
                        block.level === 1 ? "text-[15px]" : "text-[13.5px]",
                        block.level >= 3 && "text-[13px] text-[#3d4f46]",
                      )}
                      style={{ paddingLeft: Math.max(0, block.level - 1) * 10 }}
                    >
                      {block.title}
                    </h3>
                  ) : (
                    <p
                      key={`b-${i}`}
                      className="whitespace-pre-wrap text-[13px] leading-7 text-[#3d4f46]"
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
            {revising ? (
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
                      setRevising(false);
                      setNote("");
                    }}
                  >
                    返回
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" size="sm" className="h-9 flex-1 text-xs" onClick={onApprove}>
                  批准这份大纲，继续
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 flex-1 text-xs"
                  onClick={() => setRevising(true)}
                >
                  我来改结构
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
