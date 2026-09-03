"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
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
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import {
  BLUEPRINT_REVISE_CHIPS,
  pickBlueprint,
} from "@/lib/agent/blueprint-review";

interface AgentBlueprintReviewProps {
  preview?: string;
  projectBlueprintJson?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onRevise: (note?: string) => void;
  onOpenBlueprintTab?: () => void;
}

export function AgentBlueprintReview({
  preview,
  projectBlueprintJson,
  open,
  onOpenChange,
  onApprove,
  onRevise,
  onOpenBlueprintTab,
}: AgentBlueprintReviewProps) {
  const { blueprint, text } = useMemo(
    () => pickBlueprint(preview, projectBlueprintJson),
    [preview, projectBlueprintJson],
  );
  const sectionCount = blueprint?.sectionGuides.length ?? 0;
  const figureCount = blueprint?.figurePlan.items.length ?? 0;
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
          title="一起过目这份写作蓝图"
          detail={
            sectionCount > 0
              ? `${sectionCount} 节指导${figureCount > 0 ? ` · ${figureCount} 项配图` : ""}。不批准我不会按蓝图写正文。`
              : "通读主张、各节要点和配图计划。不批准我不会按蓝图写正文。"
          }
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
            要改蓝图
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
              人控节点 · 你过目之后我才按蓝图写
            </p>
            <DialogTitle className="mt-1 text-base text-[#122820]">
              一起确认写作蓝图
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed text-[#5a7a68]">
              蓝图已写入项目。请核对中心主张、各节要点与配图计划：批准后我会按这份蓝图推进写作；要改请留下意见。
            </DialogDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#5a7a68]">
              {sectionCount > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-[#1a5632]/12">
                  {sectionCount} 节指导
                </span>
              ) : null}
              {blueprint ? (
                <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-[#1a5632]/12">
                  词数 {blueprint.estimatedWordCount.min}–{blueprint.estimatedWordCount.max}
                </span>
              ) : null}
              {figureCount > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-[#1a5632]/12">
                  配图 {figureCount} 项
                </span>
              ) : null}
              {onOpenBlueprintTab ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[#1a5632] underline-offset-2 hover:underline"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenBlueprintTab();
                  }}
                >
                  <FileText className="h-3 w-3" />
                  在蓝图工作台打开
                </button>
              ) : null}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
            {blueprint ? (
              <BlueprintBody blueprint={blueprint} />
            ) : text ? (
              <article className="whitespace-pre-wrap text-[13px] leading-7 text-[#3d4f46]">
                {text}
              </article>
            ) : (
              <p className="text-sm text-[#5a7a68]">
                蓝图正文还没过来，可先打开蓝图工作台查看。
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-[#1a5632]/12 bg-[#f6f8f6] px-4 py-3">
            {revising ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {BLUEPRINT_REVISE_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#122820] ring-1 ring-[#1a5632]/14 hover:bg-[#1a5632]/5"
                      onClick={() =>
                        setNote((prev) => (prev.trim() ? `${prev.trim()}\n${chip.note}` : chip.note))
                      }
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="想怎么改蓝图？可点上方快捷意见，也可以直接写。"
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
                  批准这份蓝图，继续
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 flex-1 text-xs"
                  onClick={() => setRevising(true)}
                >
                  我来改蓝图
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BlueprintBody({ blueprint }: { blueprint: WritingBlueprint }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-medium tracking-wide text-[#1a5632]">中心主张</h3>
        <p className="mt-1 text-[15px] font-semibold leading-snug text-[#122820]">
          {blueprint.thesis.trim() || "（未写主张）"}
        </p>
      </section>
      {blueprint.narrativeSummary.trim() ? (
        <section>
          <h3 className="text-[11px] font-medium tracking-wide text-[#1a5632]">叙事摘要</h3>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-7 text-[#3d4f46]">
            {blueprint.narrativeSummary.trim()}
          </p>
        </section>
      ) : null}
      {blueprint.writingOrder.length > 0 ? (
        <section>
          <h3 className="text-[11px] font-medium tracking-wide text-[#1a5632]">建议写作顺序</h3>
          <p className="mt-1 text-[13px] leading-6 text-[#3d4f46]">
            {blueprint.writingOrder.join(" → ")}
          </p>
        </section>
      ) : null}
      <section className="space-y-3">
        <h3 className="text-[11px] font-medium tracking-wide text-[#1a5632]">各节要点</h3>
        {blueprint.sectionGuides.map((g) => (
          <div
            key={g.sectionPath}
            className="rounded-lg border border-[#1a5632]/10 bg-[#f6f8f6]/60 px-3 py-2.5"
          >
            <p className="text-[13px] font-semibold text-[#122820]">{g.sectionPath}</p>
            {g.claim?.trim() ? (
              <p className="mt-1 text-[12px] leading-6 text-[#122820]">主张：{g.claim.trim()}</p>
            ) : null}
            {g.purpose?.trim() ? (
              <p className="mt-0.5 text-[12px] leading-6 text-[#5a7a68]">{g.purpose.trim()}</p>
            ) : null}
            {g.keyPoints.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-6 text-[#3d4f46]">
                {g.keyPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {g.evidenceHint?.trim() ? (
              <p className="mt-1 text-[11px] leading-5 text-[#5a7a68]">
                证据提示：{g.evidenceHint.trim()}
              </p>
            ) : null}
          </div>
        ))}
      </section>
      {blueprint.figurePlan.items.length > 0 ? (
        <section>
          <h3 className="text-[11px] font-medium tracking-wide text-[#1a5632]">配图计划</h3>
          <ul className="mt-1 space-y-1.5 text-[12px] leading-6 text-[#3d4f46]">
            {blueprint.figurePlan.items.map((item) => (
              <li key={item.id}>
                <span className="font-medium text-[#122820]">{item.sectionPath}</span>
                {" · "}
                {item.type}
                {" · "}
                {item.purpose}
                {item.priority === "optional" ? "（可选）" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
