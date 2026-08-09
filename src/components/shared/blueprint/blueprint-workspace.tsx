"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Save,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

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

  const paperMode: "research" | "review" =
    draft?.projectMode ?? (project.mode === "research" ? "research" : "review");

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

  const updatePrerequisite = (index: number, value: string) => {
    updateDraft((prev) => {
      const next = [...prev.prerequisites];
      next[index] = value;
      return { ...prev, prerequisites: next };
    });
  };

  const removePrerequisite = (index: number) => {
    updateDraft((prev) => ({
      ...prev,
      prerequisites: prev.prerequisites.filter((_, i) => i !== index),
    }));
  };

  const addPrerequisite = () => {
    updateDraft((prev) => ({
      ...prev,
      prerequisites: [...prev.prerequisites, ""],
    }));
  };

  const renderGuideCard = (guide: SectionGuide) => (
    <div key={guide.sectionPath} className="space-y-2 border-l-2 border-[#1a5632]/25 pl-3">
      <Input
        className="h-8 border-0 border-b border-[#1a5632]/12 bg-transparent px-0 text-[13px] font-medium shadow-none focus-visible:border-[#1a5632]/40 focus-visible:ring-0"
        value={guide.sectionPath}
        onChange={(e) =>
          updateGuide(guide.sectionPath, { sectionPath: e.target.value })
        }
      />
      <Textarea
        className="min-h-[48px] resize-none border-0 bg-transparent px-0 text-[12.5px] leading-relaxed text-[#3d4f46] shadow-none focus-visible:ring-0"
        value={guide.purpose}
        onChange={(e) =>
          updateGuide(guide.sectionPath, { purpose: e.target.value })
        }
      />
      <Textarea
        className="min-h-[52px] resize-none border-0 bg-[#f4f6f4] px-2.5 py-2 text-[11px] leading-relaxed text-[#5a6b63] shadow-none focus-visible:ring-1 focus-visible:ring-[#1a5632]/20"
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
      <Textarea
        className="min-h-[40px] resize-none border-0 bg-transparent px-0 text-[11px] leading-relaxed text-[#3d4f46] shadow-none focus-visible:ring-0"
        placeholder="主张（claim）"
        value={guide.claim ?? ""}
        onChange={(e) =>
          updateGuide(guide.sectionPath, { claim: e.target.value })
        }
      />
      <Textarea
        className="min-h-[40px] resize-none border-0 bg-[#f4f6f4]/70 px-2.5 py-2 text-[11px] leading-relaxed text-[#5a6b63] shadow-none focus-visible:ring-1 focus-visible:ring-[#1a5632]/20"
        placeholder="证据要点（evidenceHint）"
        value={guide.evidenceHint ?? ""}
        onChange={(e) =>
          updateGuide(guide.sectionPath, { evidenceHint: e.target.value })
        }
      />
      <Textarea
        className="min-h-[36px] resize-none border-0 bg-transparent px-0 text-[11px] leading-relaxed text-[#5a6b63] shadow-none focus-visible:ring-0"
        placeholder="推理（warrant，可选）"
        value={guide.warrant ?? ""}
        onChange={(e) =>
          updateGuide(guide.sectionPath, { warrant: e.target.value })
        }
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eef1ee]">
      {/* 顶栏：标题 + 保存合一，去掉第二层灰条 */}
      <header className="flex shrink-0 items-center gap-3 bg-white/90 px-5 py-3.5 backdrop-blur-sm sm:px-7">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold tracking-tight text-[#122820]">
              写作蓝图
            </h2>
            <span className="rounded-full bg-[#1a5632]/10 px-2 py-0.5 text-[10px] font-medium text-[#1a5632]">
              {paperMode === "research" ? "研究论文" : "文献综述"}
            </span>
            {isDirty ? (
              <span className="text-[11px] text-amber-700">未保存</span>
            ) : (
              <span className="text-[11px] text-[#5a6b63]/70">已同步</span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-[#5a6b63]">
            改完保存即可指导扩写，不会动编辑器正文
          </p>
        </div>
        <Button
          size="sm"
          className={cn(
            "h-9 gap-1.5 rounded-full px-4",
            isDirty
              ? "bg-[#1a5632] text-white hover:bg-[#143f26]"
              : "bg-[#1a5632]/12 text-[#1a5632] hover:bg-[#1a5632]/18",
          )}
          disabled={!isDirty}
          onClick={() => save()}
        >
          <Save className="h-3.5 w-3.5" />
          保存
        </Button>
      </header>

      {isStale ? (
        <div className="mx-5 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900 sm:mx-7">
          大纲已变更，建议在大纲侧栏刷新蓝图后再编辑。
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-5 sm:px-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:py-6">
          {/* 左侧：篇幅 + 写作顺序（桌面常驻） */}
          <aside className="space-y-5 lg:sticky lg:top-0 lg:self-start">
            <div className="rounded-2xl bg-white p-4 shadow-sm shadow-[#122820]/[0.04]">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-[#1a5632]/75 uppercase">
                预计篇幅
              </p>
              <div className="mt-2.5 flex items-end gap-1.5">
                <Input
                  type="number"
                  min={0}
                  className="h-9 w-[4.75rem] rounded-lg border-[#1a5632]/12 text-center text-sm font-medium tabular-nums"
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
                <span className="pb-2 text-[#5a6b63]">–</span>
                <Input
                  type="number"
                  min={0}
                  className="h-9 w-[4.75rem] rounded-lg border-[#1a5632]/12 text-center text-sm font-medium tabular-nums"
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
                <span className="pb-2 text-[12px] text-[#5a6b63]">字</span>
              </div>
              {figurePlan.items.length > 0 ? (
                <p className="mt-3 text-[11.5px] text-[#5a6b63]">
                  配图 {figurePlan.totalMin}–{figurePlan.totalMax} 张
                  <span className="text-[#5a6b63]/70"> · {figurePlan.items.length} 项</span>
                </p>
              ) : null}
              <p className="mt-2 text-[10.5px] leading-relaxed text-[#5a6b63]/85">
                {paperMode === "research"
                  ? "流程在方法，数据图在结果；引言/结论各至多 1 张示意。"
                  : "偏概念框架、对比表与趋势图，不安排本试验数据图。"}
              </p>
            </div>

            {draft.writingOrder.length > 0 ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm shadow-[#122820]/[0.04]">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-[#1a5632]/75 uppercase">
                  写作顺序
                </p>
                <ol className="mt-3 space-y-1.5">
                  {draft.writingOrder.map((path, index) => (
                    <li
                      key={`${path}-${index}`}
                      className="group flex items-center gap-1.5 rounded-lg py-0.5"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#1a5632]/10 text-[10px] font-semibold text-[#1a5632]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#122820]">
                        {path}
                      </span>
                      <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded p-0.5 text-[#5a6b63] hover:bg-[#eef1ee] disabled:opacity-30"
                          disabled={index === 0}
                          onClick={() => moveWritingOrder(index, -1)}
                          aria-label="上移"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 text-[#5a6b63] hover:bg-[#eef1ee] disabled:opacity-30"
                          disabled={index === draft.writingOrder.length - 1}
                          onClick={() => moveWritingOrder(index, 1)}
                          aria-label="下移"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </aside>

          {/* 主栏：开放排版，少套盒 */}
          <main className="min-w-0 space-y-8 rounded-2xl bg-white px-5 py-6 shadow-sm shadow-[#122820]/[0.04] sm:px-8 sm:py-7">
            <section>
              <Label>核心论点</Label>
              <Textarea
                className="mt-2 min-h-[88px] resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.65] text-[#122820] shadow-none focus-visible:ring-0"
                value={draft.thesis}
                onChange={(e) => updateDraft((p) => ({ ...p, thesis: e.target.value }))}
              />
            </section>

            <section className="border-t border-[#1a5632]/08 pt-6">
              <Label>叙事脉络</Label>
              <Textarea
                className="mt-2 min-h-[100px] resize-none border-0 bg-transparent p-0 text-[13.5px] leading-[1.7] text-[#3d4f46] shadow-none focus-visible:ring-0"
                value={draft.narrativeSummary}
                onChange={(e) =>
                  updateDraft((p) => ({ ...p, narrativeSummary: e.target.value }))
                }
              />
            </section>

            {draft.prerequisites.length > 0 ? (
              <section className="border-t border-[#1a5632]/08 pt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <Label>前置条件</Label>
                  <button
                    type="button"
                    onClick={addPrerequisite}
                    className="text-[11.5px] font-medium text-[#1a5632] hover:underline"
                  >
                    + 添加
                  </button>
                </div>
                <ul className="mt-3 space-y-2">
                  {draft.prerequisites.map((line, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eef1ee] text-[10px] font-semibold text-[#1a5632]">
                        {index + 1}
                      </span>
                      <Input
                        className="h-9 flex-1 rounded-lg border-[#1a5632]/10 bg-[#f7f8f6] text-[12.5px] shadow-none focus-visible:bg-white focus-visible:ring-[#1a5632]/20"
                        value={line}
                        onChange={(e) => updatePrerequisite(index, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removePrerequisite(index)}
                        className="mt-2 text-[11px] text-[#5a6b63] hover:text-destructive"
                        aria-label="删除"
                      >
                        删
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {figurePlan.items.length > 0 ? (
              <section className="border-t border-[#1a5632]/08 pt-6">
                <Label>配图规划</Label>
                <div className="mt-3 grid gap-3">
                  {figurePlan.items.map((item, index) => {
                    const plotHref = blueprintFigureToPlotHref(
                      projectId,
                      item,
                      chartConfigs,
                    );
                    const bindingLabel =
                      item.type === "chart"
                        ? blueprintFigureDataBindingLabel(item)
                        : null;
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl bg-[#f7f8f6] p-3.5 sm:p-4"
                      >
                        <div className="mb-2.5 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold tabular-nums text-[#1a5632]/70">
                            FIG {index + 1}
                          </span>
                          <Select
                            value={item.type}
                            onValueChange={(v) =>
                              updateFigure(item.id, { type: v as FigurePlanType })
                            }
                          >
                            <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-white px-2 text-[11px] shadow-sm">
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
                          <Select
                            value={item.priority}
                            onValueChange={(v) =>
                              updateFigure(item.id, {
                                priority: v as FigurePlanPriority,
                              })
                            }
                          >
                            <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-white px-2 text-[11px] shadow-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="required">必需</SelectItem>
                              <SelectItem value="optional">可选</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            className="h-7 min-w-[8rem] flex-1 border-0 bg-white px-2 text-[11px] shadow-sm"
                            value={item.sectionPath}
                            onChange={(e) =>
                              updateFigure(item.id, { sectionPath: e.target.value })
                            }
                            placeholder="所属章节"
                          />
                          {plotHref ? (
                            <Link
                              href={plotHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1a5632] hover:underline"
                            >
                              绘图
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : null}
                        </div>
                        <Input
                          className="mb-1.5 h-8 border-0 bg-transparent px-0 text-[13px] font-medium shadow-none focus-visible:ring-0"
                          value={item.suggestedCaption}
                          onChange={(e) =>
                            updateFigure(item.id, {
                              suggestedCaption: e.target.value,
                            })
                          }
                          placeholder="图题"
                        />
                        <Textarea
                          className="min-h-[44px] resize-none border-0 bg-transparent px-0 text-[12px] leading-relaxed text-[#5a6b63] shadow-none focus-visible:ring-0"
                          value={item.purpose}
                          onChange={(e) =>
                            updateFigure(item.id, { purpose: e.target.value })
                          }
                          placeholder="用途说明"
                        />
                        {item.type === "chart" ? (
                          <div className="mt-2">
                            {chartCatalog.length === 0 ? (
                              <p className="text-[10.5px] text-[#5a6b63]">
                                请先上传实验数据后再绑定
                              </p>
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
                                <SelectTrigger className="h-7 w-full max-w-xs border-0 bg-white text-[10.5px] shadow-sm">
                                  <SelectValue placeholder="绑定数据" />
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
                            )}
                            {bindingLabel ? (
                              <p className="mt-1 text-[10px] text-[#1a5632]/80">
                                {bindingLabel}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {draft.sectionGuides.length > 0 ? (
              <section className="border-t border-[#1a5632]/08 pt-6 pb-2">
                <Label>章节导览</Label>
                <div className="mt-4 space-y-5">
                  {guideGroups.map((group) => {
                    if (group.nested.length === 0) {
                      return (
                        <div key={group.top} className="space-y-4">
                          {group.topLevel.map((g) => renderGuideCard(g))}
                        </div>
                      );
                    }
                    const open = openGroups.has(group.top);
                    return (
                      <div key={group.top}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.top)}
                          className="mb-3 flex w-full items-center gap-2 text-left"
                        >
                          {open ? (
                            <ChevronDown className="h-4 w-4 text-[#1a5632]/70" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-[#1a5632]/70" />
                          )}
                          <span className="text-[13px] font-semibold text-[#122820]">
                            {group.top}
                          </span>
                          <span className="text-[11px] text-[#5a6b63]">
                            {group.nested.length} 个子节
                          </span>
                        </button>
                        {open ? (
                          <div className="space-y-4 pl-1">
                            {group.topLevel.map((g) => renderGuideCard(g))}
                            {group.nested.map((g) => renderGuideCard(g))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </ScrollArea>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-[0.06em] text-[#1a5632]/80 uppercase">
      {children}
    </h3>
  );
}
