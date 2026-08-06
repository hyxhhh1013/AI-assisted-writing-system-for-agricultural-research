"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  ArrowRight,
  ExternalLink,
  FlaskConical,
  BookOpen,
  Link2,
  Loader2,
  Calendar,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import { fetchPaperBrief } from "@/services/direction";
import type { PaperCandidate, RoadmapPaper, ExperimentDependency } from "@/contracts/direction";
import type { DirectionWritingContext } from "@/contracts/direction-writing-bridge";
import { canStartWritingFromRoadmap, writingActionLabel } from "@/lib/direction-roadmap-match";

const TIER_LABELS: Record<string, string> = {
  ready: "可立即启动",
  needs_experiment: "需补实验",
  long_term: "远期规划",
};

const TIER_COLORS: Record<string, string> = {
  ready: "bg-[#1a5632]/8 text-[#1a5632] border-[#1a5632]/20",
  needs_experiment: "bg-[#b8975a]/8 text-[#b8975a] border-[#b8975a]/20",
  long_term: "bg-[#6b7c72]/8 text-[#6b7c72] border-[#6b7c72]/20",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "规划中",
  writing: "写作中",
  submitted: "已投稿",
  published: "已发表",
};

const DIM_LABELS: Record<string, string> = {
  D1: "已有基础",
  D2: "问题框架",
  D3: "研究缺口",
  D4: "数据质量",
  D5: "机会排序",
  D6: "实验补全",
  D7: "创新性",
  D8: "跨方向",
};

const ROLE_LABELS: Record<string, string> = {
  core: "核心",
  supporting: "支撑",
  background: "背景",
};

interface DirectionRoadmapPaperDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  candidate: PaperCandidate;
  paper: RoadmapPaper;
  timelineQuarter?: string;
  relatedDependencies?: ExperimentDependency[];
  onStartWriting?: () => void;
}

export function DirectionRoadmapPaperDetailDialog({
  open,
  onOpenChange,
  slug,
  candidate,
  paper,
  timelineQuarter,
  relatedDependencies = [],
  onStartWriting,
}: DirectionRoadmapPaperDetailDialogProps) {
  const [brief, setBrief] = useState<DirectionWritingContext | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBriefLoading(true);
    setBriefError("");
    fetchPaperBrief(slug, candidate.id)
      .then(setBrief)
      .catch((err) => {
        setBriefError(err instanceof Error ? err.message : "加载写作上下文失败");
        setBrief(null);
      })
      .finally(() => setBriefLoading(false));
  }, [open, slug, candidate.id]);

  const canStartWriting = canStartWritingFromRoadmap(paper);
  const writingLabel = writingActionLabel(candidate.tier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-[#1a5632]/8 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a5632]/8 text-sm font-bold text-[#1a5632]">
              P{paper.priority}
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <DialogTitle className="text-left text-base leading-snug text-[#122820]">
                {candidate.title}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-left">
                <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", TIER_COLORS[candidate.tier])}>
                  {TIER_LABELS[candidate.tier]}
                </Badge>
                <span className="text-[10px] text-[#9aa8a0]">
                  {STATUS_LABELS[paper.status] || paper.status}
                </span>
                {timelineQuarter && (
                  <span className="flex items-center gap-0.5 text-[10px] text-[#9aa8a0]">
                    <Calendar className="h-3 w-3" /> {timelineQuarter}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)]">
          <div className="space-y-5 px-5 py-4">
            {/* 评分概览 */}
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#122820]">
                <BarChart3 className="h-3.5 w-3.5 text-[#1a5632]" /> D5 候选评估
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatPill label="综合分" value={`${candidate.overallScore}/10`} />
                {candidate.suggestedJournal && (
                  <StatPill label="目标期刊" value={candidate.suggestedJournal} small />
                )}
                {candidate.estimatedCompletion && (
                  <StatPill label="预计完成" value={candidate.estimatedCompletion} />
                )}
              </div>
              {Object.keys(candidate.dimensionScores || {}).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(candidate.dimensionScores).map(([id, score]) => (
                    <span
                      key={id}
                      className="rounded border border-[#1a5632]/10 bg-[#f6f5f1]/60 px-1.5 py-0.5 text-[10px] text-[#6b7c72]"
                    >
                      {DIM_LABELS[id] || id}: {score}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 待补实验 */}
            {candidate.requiredExperiments.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#122820]">
                  <FlaskConical className="h-3.5 w-3.5 text-[#2563eb]" /> 待补实验（D6）
                </h4>
                <ul className="space-y-1">
                  {candidate.requiredExperiments.map((exp, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-[#2563eb]/12 bg-[#2563eb]/3 px-3 py-2 text-xs text-[#3d4f46]"
                    >
                      {exp}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 实验依赖 */}
            {relatedDependencies.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-semibold text-[#122820]">路线图实验依赖</h4>
                <div className="space-y-1.5">
                  {relatedDependencies.map((dep, i) => (
                    <div key={i} className="rounded-md border border-[#1a5632]/8 px-3 py-2 text-xs text-[#6b7c72]">
                      {dep.description}
                      <span className="mt-0.5 block text-[10px] text-[#9aa8a0]">
                        周期 {dep.estimatedDuration}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 写作桥接说明 */}
            <section className="rounded-lg border border-[#2563eb]/15 bg-[#2563eb]/[0.03] p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#2563eb]">
                <Link2 className="h-3.5 w-3.5" /> 与写作工作台如何连接
              </h4>
              <ol className="space-y-2 text-[11px] leading-relaxed text-[#3d4f46]">
                <li className="flex gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/10 text-[9px] font-bold text-[#2563eb]">1</span>
                  <span>
                    <strong>paper-brief</strong>：从本方向知识库 + D3/D5/D6 分析提取文献清单、写作动机、待补实验
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/10 text-[9px] font-bold text-[#2563eb]">2</span>
                  <span>
                    <strong>创建项目</strong>：POST /api/projects，带入方向 slug、论文类型、引用格式
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/10 text-[9px] font-bold text-[#2563eb]">3</span>
                  <span>
                    <strong>注入文献</strong>：paper-brief 中的必读文献写入项目 references
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/10 text-[9px] font-bold text-[#2563eb]">4</span>
                  <span>
                    <strong>生成蓝图</strong>：POST /api/outline/blueprint，动机/期刊/待补实验进入写作大纲；路线图状态改为「写作中」
                  </span>
                </li>
              </ol>
            </section>

            {/* 写作上下文预览 */}
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#122820]">
                <BookOpen className="h-3.5 w-3.5 text-[#1a5632]" /> 将带入写作的内容（预览）
              </h4>
              {briefLoading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-[#9aa8a0]">
                  <Loader2 className="h-4 w-4 animate-spin" /> 加载 paper-brief…
                </div>
              ) : briefError ? (
                <p className="text-xs text-[#dc2626]">{briefError}</p>
              ) : brief ? (
                <div className="space-y-2 text-xs text-[#3d4f46]">
                  {brief.motivationFromGap && (
                    <PreviewBlock label="写作动机（D3）" content={brief.motivationFromGap} />
                  )}
                  {brief.themeSuggestions && brief.themeSuggestions.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-medium text-[#6b7c72]">主题建议</p>
                      <ul className="list-inside list-disc text-[11px] text-[#3d4f46]">
                        {brief.themeSuggestions.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(brief.pendingExperiments?.length ?? 0) > 0 && (
                    <PreviewBlock
                      label="待补实验（将写入 Blueprint）"
                      content={brief.pendingExperiments!.join("；")}
                    />
                  )}
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-[#6b7c72]">
                      预注入文献 {brief.requiredReferences.length} 篇
                    </p>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-[#1a5632]/8 bg-[#f6f5f1]/40 p-2">
                      {brief.requiredReferences.slice(0, 8).map((ref, i) => (
                        <div key={i} className="text-[10px] leading-snug text-[#6b7c72]">
                          <Badge variant="outline" className="mr-1 h-3.5 px-1 text-[8px]">
                            {ROLE_LABELS[ref.role] || ref.role}
                          </Badge>
                          {ref.title.slice(0, 80)}{ref.title.length > 80 ? "…" : ""}
                        </div>
                      ))}
                      {brief.requiredReferences.length > 8 && (
                        <p className="text-[10px] text-[#9aa8a0]">
                          另有 {brief.requiredReferences.length - 8} 篇…
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 border-t border-[#1a5632]/8 px-5 py-3">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <div className="flex gap-2">
            {paper.linkedProjectId && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => window.open(`/workbench?id=${paper.linkedProjectId}`, "_blank")}
              >
                <ExternalLink className="h-3 w-3" /> 打开写作项目
              </Button>
            )}
            {canStartWriting && onStartWriting && (
              <Button
                size="sm"
                className={cn("h-8 gap-1 text-xs", siteTheme.btnPrimary)}
                onClick={() => {
                  onOpenChange(false);
                  onStartWriting();
                }}
              >
                <FileText className="h-3 w-3" /> {writingLabel}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
            {!canStartWriting && paper.status !== "planned" && (
              <span className="text-[10px] text-[#9aa8a0]">
                当前状态：{STATUS_LABELS[paper.status] || paper.status}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatPill({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-md border border-[#1a5632]/8 bg-white px-2.5 py-2">
      <p className="text-[9px] text-[#9aa8a0]">{label}</p>
      <p className={cn("font-semibold tabular-nums text-[#122820]", small ? "text-[10px] leading-tight" : "text-sm")}>
        {value}
      </p>
    </div>
  );
}

function PreviewBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-md border border-[#1a5632]/8 bg-white px-3 py-2">
      <p className="mb-0.5 text-[10px] font-medium text-[#6b7c72]">{label}</p>
      <p className="text-[11px] leading-relaxed text-[#3d4f46]">{content}</p>
    </div>
  );
}
