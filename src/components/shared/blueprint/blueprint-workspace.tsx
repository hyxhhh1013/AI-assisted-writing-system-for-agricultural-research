"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectData } from "@/contracts/project";
import { parseDataSources } from "@/contracts/project";
import { collectChartConfigsFromSources } from "@/contracts/figure";
import type {
  FigurePlanItem,
  FigurePlanPriority,
  FigurePlanType,
  SectionGuide,
  WritingBlueprint,
} from "@/contracts/writing-blueprint";
import { useBlueprintEditor } from "@/hooks/use-blueprint-editor";
import {
  blueprintFigureDataBindingLabel,
  blueprintFigureToPlotHref,
  buildBlueprintChartCatalog,
  figureTypeLabel,
  groupSectionGuides,
} from "@/lib/blueprint-utils";

const FIGURE_TYPES: FigurePlanType[] = [
  "flow",
  "chart",
  "xrd",
  "table",
  "schematic",
  "other",
];

interface BlueprintWorkspaceProps {
  blueprint: WritingBlueprint;
  project: ProjectData;
  projectId: string;
  isStale: boolean;
  onSave: (blueprint: WritingBlueprint) => void;
  registerRequestClose?: (fn: () => boolean) => void;
}

export function BlueprintWorkspace({
  blueprint: initialBlueprint,
  project,
  projectId,
  isStale,
  onSave,
  registerRequestClose,
}: BlueprintWorkspaceProps) {
  const { draft, isDirty, updateDraft, save, requestClose } = useBlueprintEditor(
    initialBlueprint,
    onSave,
  );

  useEffect(() => {
    registerRequestClose?.(requestClose);
  }, [registerRequestClose, requestClose]);

  const chartConfigs = useMemo(
    () => collectChartConfigsFromSources(parseDataSources(project)),
    [project],
  );
  const chartCatalog = useMemo(
    () => buildBlueprintChartCatalog(parseDataSources(project)),
    [project],
  );

  /** 论文类型（优先蓝图自带的 projectMode，其次项目 mode） */
  const paperMode: "research" | "review" =
    draft?.projectMode ?? (project.mode === "research" ? "research" : "review");

  /** 章节导览按顶层章节分组（sectionPath 用 " > " 表示层级，如「研究进展综述 > 生物油定向提质」） */
  const guideGroups = useMemo(
    () => groupSectionGuides(draft?.sectionGuides ?? []),
    [draft],
  );

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!draft) return null;

  const { figurePlan } = draft;

  const updateFigure = (id: string, patch: Partial<FigurePlanItem>) => {
    updateDraft((prev) => ({
      ...prev,
      figurePlan: {
        ...prev.figurePlan,
        items: prev.figurePlan.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    }));
  };

  const bindFigureChart = (figureId: string, chartIndex: number | null) => {
    updateDraft((prev) => ({
      ...prev,
      figurePlan: {
        ...prev.figurePlan,
        items: prev.figurePlan.items.map((item) => {
          if (item.id !== figureId || item.type !== "chart") return item;
          if (chartIndex === null) {
            const { dataBinding: _removed, ...rest } = item;
            return rest;
          }
          const entry = chartCatalog[chartIndex];
          if (!entry) return item;
          return {
            ...item,
            dataBinding: {
              kind: "chartConfig",
              chartConfigIndex: chartIndex,
              sourceFileName: entry.sourceFileName,
              variable: entry.variable,
              chartTitle: entry.title,
            },
          };
        }),
      },
    }));
  };

  const updateGuide = (sectionPath: string, patch: Partial<SectionGuide>) => {
    updateDraft((prev) => ({
      ...prev,
      sectionGuides: prev.sectionGuides.map((g) =>
        g.sectionPath === sectionPath ? { ...g, ...patch } : g,
      ),
    }));
  };

  const moveWritingOrder = (index: number, direction: -1 | 1) => {
    updateDraft((prev) => {
      const order = [...prev.writingOrder];
      const target = index + direction;
      if (target < 0 || target >= order.length) return prev;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...prev, writingOrder: order };
    });
  };

  /** 单个章节指导卡片（分组后复用） */
  const renderGuideCard = (guide: SectionGuide) => (
    <div
      key={guide.sectionPath}
      className="rounded-md border p-3 space-y-2 bg-background"
    >
      <Input
        className="h-8 text-xs font-medium"
        value={guide.sectionPath}
        onChange={(e) =>
          updateGuide(guide.sectionPath, { sectionPath: e.target.value })
        }
      />
      <Textarea
        className="min-h-[56px] text-xs text-muted-foreground"
        value={guide.purpose}
        onChange={(e) =>
          updateGuide(guide.sectionPath, { purpose: e.target.value })
        }
      />
      <Textarea
        className="min-h-[64px] text-[11px] font-mono"
        placeholder="要点，每行一条"
        value={guide.keyPoints.join("\n")}
        onChange={(e) =>
          updateGuide(guide.sectionPath, {
            keyPoints: e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-muted/20 px-4">
        {isStale && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/80 rounded px-2 py-1">
            大纲已变更，建议在大纲侧栏刷新蓝图
          </span>
        )}
        <span className="rounded-md border border-[#1a5632]/20 bg-[#1a5632]/8 px-2 py-1 text-[10px] font-medium text-[#1a5632]">
          {paperMode === "research" ? "研究论文" : "文献综述"}
        </span>
        <div className="min-w-0 flex-1" />
        <Button
          size="sm"
          className="gap-1.5 h-8"
          disabled={!isDirty}
          onClick={() => save()}
        >
          <Save className="h-3.5 w-3.5" />
          保存修改
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-6 text-sm max-w-5xl">
          <SectionHeading>核心论点</SectionHeading>
          <Textarea
            className="min-h-[72px] text-sm leading-relaxed"
            value={draft.thesis}
            onChange={(e) => updateDraft((p) => ({ ...p, thesis: e.target.value }))}
          />

          <SectionHeading>叙事脉络</SectionHeading>
          <Textarea
            className="min-h-[88px] text-sm leading-relaxed"
            value={draft.narrativeSummary}
            onChange={(e) =>
              updateDraft((p) => ({ ...p, narrativeSummary: e.target.value }))
            }
          />

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              预计篇幅
              <Input
                type="number"
                min={0}
                className="h-7 w-20 text-xs"
                value={draft.estimatedWordCount.min}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    estimatedWordCount: {
                      ...p.estimatedWordCount,
                      min: Number(e.target.value) || 0,
                    },
                  }))
                }
              />
              –
              <Input
                type="number"
                min={0}
                className="h-7 w-20 text-xs"
                value={draft.estimatedWordCount.max}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    estimatedWordCount: {
                      ...p.estimatedWordCount,
                      max: Number(e.target.value) || 0,
                    },
                  }))
                }
              />
              字
            </span>
            {figurePlan.items.length > 0 && (
              <span>
                配图：{figurePlan.totalMin}–{figurePlan.totalMax} 张（明细 {figurePlan.items.length} 项）
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            {paperMode === "research"
              ? "研究论文：流程图集中在「材料与方法」，数据图/XRD 集中在「结果与分析」，引言/结论 0–1 张示意。"
              : "文献综述：以概念框架图、对比表、趋势综合图为主，不安排本试验数据图。"}
          </p>

          {draft.prerequisites.length > 0 && (
            <div className="space-y-1.5">
              <SectionHeading>前置条件</SectionHeading>
              <Textarea
                className="min-h-[64px] text-xs font-mono"
                placeholder="每行一条"
                value={draft.prerequisites.join("\n")}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    prerequisites: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
          )}

          {figurePlan.items.length > 0 && (
          <div className="space-y-2">
            <SectionHeading>配图规划</SectionHeading>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium w-[88px]">章节</th>
                    <th className="text-left p-2 font-medium w-[72px]">类型</th>
                    <th className="text-left p-2 font-medium">图题 / 用途</th>
                    <th className="text-left p-2 font-medium w-[64px]">优先级</th>
                    <th className="text-left p-2 font-medium w-[120px]">数据</th>
                    <th className="text-left p-2 font-medium w-14">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {figurePlan.items.map((item) => {
                    const plotHref = blueprintFigureToPlotHref(projectId, item, chartConfigs);
                    const bindingLabel =
                      item.type === "chart" ? blueprintFigureDataBindingLabel(item) : null;
                    return (
                      <tr key={item.id} className="border-t align-top">
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            value={item.sectionPath}
                            onChange={(e) =>
                              updateFigure(item.id, { sectionPath: e.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Select
                            value={item.type}
                            onValueChange={(v) =>
                              updateFigure(item.id, { type: v as FigurePlanType })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIGURE_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {figureTypeLabel(t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 space-y-1.5">
                          <Input
                            className="h-7 text-xs font-medium"
                            value={item.suggestedCaption}
                            onChange={(e) =>
                              updateFigure(item.id, { suggestedCaption: e.target.value })
                            }
                          />
                          <Textarea
                            className="min-h-[52px] text-xs text-muted-foreground"
                            value={item.purpose}
                            onChange={(e) =>
                              updateFigure(item.id, { purpose: e.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Select
                            value={item.priority}
                            onValueChange={(v) =>
                              updateFigure(item.id, { priority: v as FigurePlanPriority })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="required">必需</SelectItem>
                              <SelectItem value="optional">可选</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          {item.type === "chart" ? (
                            chartCatalog.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground leading-snug">
                                请先上传实验数据
                              </span>
                            ) : (
                              <Select
                                value={
                                  item.dataBinding?.kind === "chartConfig"
                                    ? String(item.dataBinding.chartConfigIndex)
                                    : "none"
                                }
                                onValueChange={(v) => {
                                  if (!v || v === "none") {
                                    bindFigureChart(item.id, null);
                                    return;
                                  }
                                  bindFigureChart(item.id, Number.parseInt(v, 10));
                                }}
                              >
                                <SelectTrigger className="h-7 text-[10px] px-2">
                                  <SelectValue placeholder="绑定" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">不绑定</SelectItem>
                                  {chartCatalog.map((c) => (
                                    <SelectItem key={c.index} value={String(c.index)}>
                                      [{c.index}] {c.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {bindingLabel && (
                            <p className="text-[10px] text-emerald-700 mt-1 leading-snug">
                              {bindingLabel}
                            </p>
                          )}
                        </td>
                        <td className="p-2">
                          {plotHref ? (
                            <Link
                              href={plotHref}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline whitespace-nowrap"
                            >
                              绘图 →
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {draft.sectionGuides.length > 0 && (
          <div className="space-y-2">
            <SectionHeading>章节导览</SectionHeading>
            <div className="space-y-3">
              {guideGroups.map((group) => {
                if (group.nested.length === 0) {
                  return group.topLevel.map((g) => renderGuideCard(g));
                }
                const open = openGroups.has(group.top);
                return (
                  <div key={group.top} className="overflow-hidden rounded-md border">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.top)}
                      className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-xs font-semibold">{group.top}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {group.nested.length} 个子节
                      </span>
                    </button>
                    {open && (
                      <div className="space-y-2 border-t p-2 pl-4">
                        {group.topLevel.map((g) => renderGuideCard(g))}
                        {group.nested.map((g) => renderGuideCard(g))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {draft.writingOrder.length > 0 && (
            <div className="space-y-2 pb-2">
              <SectionHeading>建议写作顺序</SectionHeading>
              <p className="text-[10px] text-muted-foreground">
                调整顺序仅作扩写参考，不影响大纲结构。
              </p>
              <div className="space-y-1.5">
                {draft.writingOrder.map((path, index) => (
                  <div
                    key={`${path}-${index}`}
                    className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
                  >
                    <span className="text-[10px] text-muted-foreground w-5 shrink-0">
                      {index + 1}.
                    </span>
                    <span className="flex-1 text-xs truncate">{path}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0}
                      onClick={() => moveWritingOrder(index, -1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === draft.writingOrder.length - 1}
                      onClick={() => moveWritingOrder(index, 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}
