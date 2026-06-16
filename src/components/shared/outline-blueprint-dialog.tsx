"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import { figureTypeLabel } from "@/lib/blueprint-utils";

interface OutlineBlueprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blueprint: WritingBlueprint | null;
}

export function OutlineBlueprintDialog({
  open,
  onOpenChange,
  blueprint,
}: OutlineBlueprintDialogProps) {
  if (!blueprint) return null;

  const { figurePlan } = blueprint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>写作蓝图</DialogTitle>
          <DialogDescription>
            扩写前的全局导航：叙事、配图与章节分工（可在扩写时自动注入 AI 上下文）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <section className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              核心论点
            </h3>
            <p className="text-sm leading-relaxed">{blueprint.thesis}</p>
          </section>

          <section className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              叙事脉络
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {blueprint.narrativeSummary}
            </p>
          </section>

          <section className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>
              预计篇幅：{blueprint.estimatedWordCount.min.toLocaleString()}–
              {blueprint.estimatedWordCount.max.toLocaleString()} 字
            </span>
            <span>
              配图：{figurePlan.totalMin}–{figurePlan.totalMax} 张（明细 {figurePlan.items.length} 项）
            </span>
          </section>

          {blueprint.prerequisites.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                前置条件
              </h3>
              <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
                {blueprint.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              配图规划
            </h3>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">章节</th>
                    <th className="text-left p-2 font-medium w-16">类型</th>
                    <th className="text-left p-2 font-medium">图题 / 用途</th>
                    <th className="text-left p-2 font-medium w-12">优先级</th>
                  </tr>
                </thead>
                <tbody>
                  {figurePlan.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2 align-top text-muted-foreground">{item.sectionPath}</td>
                      <td className="p-2 align-top">{figureTypeLabel(item.type)}</td>
                      <td className="p-2 align-top">
                        <div className="font-medium">{item.suggestedCaption}</div>
                        <div className="text-muted-foreground mt-0.5">{item.purpose}</div>
                      </td>
                      <td className="p-2 align-top">
                        {item.priority === "required" ? "必需" : "可选"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              章节导览
            </h3>
            <div className="space-y-2">
              {blueprint.sectionGuides.map((guide) => (
                <div key={guide.sectionPath} className="rounded-md border p-2.5 space-y-1">
                  <div className="text-xs font-medium">{guide.sectionPath}</div>
                  <p className="text-xs text-muted-foreground">{guide.purpose}</p>
                  {guide.keyPoints.length > 0 && (
                    <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                      {guide.keyPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          {blueprint.writingOrder.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                建议写作顺序
              </h3>
              <p className="text-xs text-muted-foreground">
                {blueprint.writingOrder.join(" → ")}
              </p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
