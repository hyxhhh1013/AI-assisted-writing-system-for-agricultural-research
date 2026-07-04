"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Map,
  Play,
  Loader2,
  ArrowRight,
  ExternalLink,
  Clock,
  FlaskConical,
  FileText,
} from "lucide-react";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { generateRoadmap, createProjectFromRoadmap } from "@/services/direction";
import type { DirectionRoadmap } from "@/contracts/direction";

interface DirectionRoadmapTimelineProps {
  slug: string;
  existingRoadmap?: DirectionRoadmap | null;
  candidates?: Array<{ id: string; title: string; tier: string; overallScore: number; suggestedJournal?: string }>;
  onRoadmapGenerated?: () => void;
}

const TIER_COLORS: Record<string, string> = {
  ready: "bg-[#1a5632]/8 text-[#1a5632] border-[#1a5632]/20",
  needs_experiment: "bg-[#b8975a]/8 text-[#b8975a] border-[#b8975a]/20",
  long_term: "bg-[#6b7c72]/8 text-[#6b7c72] border-[#6b7c72]/20",
};

const TIER_LABELS: Record<string, string> = {
  ready: "可立即启动",
  needs_experiment: "需补实验",
  long_term: "远期规划",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "规划中",
  writing: "写作中",
  submitted: "已投稿",
  published: "已发表",
};

export function DirectionRoadmapTimeline({
  slug,
  existingRoadmap,
  candidates,
  onRoadmapGenerated,
}: DirectionRoadmapTimelineProps) {
  const [roadmap, setRoadmap] = useState<DirectionRoadmap | null>(existingRoadmap || null);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await generateRoadmap(slug);
      setRoadmap(result.roadmap);
      setSummary(result.summary);
      toast.success("路线图已生成");
      onRoadmapGenerated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成路线图失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (candidateId: string, title: string) => {
    setCreatingId(candidateId);
    try {
      const candidate = candidates?.find((c) => c.id === candidateId);
      const paperTitle = candidate?.title || title || `路线图论文 - ${candidateId}`;
      const result = await createProjectFromRoadmap(paperTitle, slug, candidateId, {
        motivationFromGap: `来自方向路线图规划，经 8 维度分析确认数据充分性。`,
        dataBasis: [],
        targetJournal: candidate?.suggestedJournal,
        pendingExperiments: candidate?.tier === "needs_experiment" ? ["需补实验"] : [],
        roadmapCandidateId: candidateId,
      });
      toast.success("写作项目已创建");

      // 更新路线图中的状态
      if (roadmap) {
        const updatedPapers = roadmap.papers.map((p) =>
          p.candidateId === candidateId
            ? { ...p, status: "writing" as const, linkedProjectId: result.projectId }
            : p,
        );
        setRoadmap({ ...roadmap, papers: updatedPapers });
      }

      // 打开工作台
      window.open(`/workbench?id=${result.projectId}`, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建项目失败");
    } finally {
      setCreatingId(null);
    }
  };

  // 无路线图状态
  if (!roadmap) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <Map className="h-10 w-10 text-[#9aa8a0]" />
        <div>
          <p className="text-sm text-[#6b7c72]">尚未生成论文路线图</p>
          <p className="mt-1 text-xs text-[#9aa8a0]">
            路线图基于 8 维度分析结果，生成论文优先级排序和时间线规划。
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className={cn("gap-1.5", siteTheme.btnPrimary)}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> 生成中…</>
          ) : (
            <><Play className="h-4 w-4" /> 生成路线图</>
          )}
        </Button>
      </div>
    );
  }

  // 路线图时间线
  return (
    <div className="space-y-6">
      {/* 总体说明 */}
      {summary && (
        <div className="rounded-lg border border-[#1a5632]/8 bg-[#f6f5f1]/50 px-4 py-3">
          <p className="text-sm leading-relaxed text-[#3d4f46]">{summary}</p>
        </div>
      )}

      {/* 论文优先级列表 */}
      <div>
        <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#122820]">
          <FileText className="h-4 w-4 text-[#1a5632]" /> 论文优先级
        </h4>
        <div className="space-y-2">
          {roadmap.papers
            .sort((a, b) => a.priority - b.priority)
            .map((paper) => {
              const candidate = candidates?.find((c) => c.id === paper.candidateId);
              const tier = candidate?.tier || "long_term";
              const isCreating = creatingId === paper.candidateId;

              return (
                <div
                  key={paper.candidateId}
                  className="flex items-center gap-3 rounded-lg border border-[#1a5632]/8 bg-white px-4 py-3"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1a5632]/8 text-xs font-bold text-[#1a5632]">
                    {paper.priority}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#122820] line-clamp-1">
                      {candidate?.title || paper.candidateId}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", TIER_COLORS[tier])}>
                        {TIER_LABELS[tier] || tier}
                      </Badge>
                      {candidate?.suggestedJournal && (
                        <span className="text-[10px] text-[#9aa8a0]">{candidate.suggestedJournal}</span>
                      )}
                      <span className="text-[10px] text-[#9aa8a0]">
                        {STATUS_LABELS[paper.status] || paper.status}
                      </span>
                      {paper.linkedProjectId && (
                        <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[9px] border-[#2563eb]/20 bg-[#2563eb]/8 text-[#2563eb]">
                          <ExternalLink className="h-2.5 w-2.5" /> 已创建项目
                        </Badge>
                      )}
                    </div>
                  </div>
                  {tier === "ready" && paper.status === "planned" && (
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleCreateProject(paper.candidateId, candidate?.title || "")}
                      disabled={isCreating}
                    >
                      {isCreating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3 w-3" />
                      )}
                      开始写作
                    </Button>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* 时间线 */}
      {roadmap.timeline.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#122820]">
            <Clock className="h-4 w-4 text-[#1a5632]" /> 时间线
          </h4>
          <div className="relative ml-4 border-l-2 border-[#1a5632]/12 pl-6 space-y-4">
            {roadmap.timeline.map((entry) => (
              <div key={entry.quarter} className="relative">
                <div className="absolute -left-[1.65rem] top-1 h-3 w-3 rounded-full border-2 border-[#1a5632] bg-white" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[#1a5632]">{entry.quarter}</span>
                  {entry.papers.map((pid) => {
                    const candidate = candidates?.find((c) => c.id === pid);
                    return (
                      <p key={pid} className="text-sm text-[#3d4f46]">
                        {candidate?.title || pid}
                      </p>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 实验依赖 */}
      {roadmap.experimentDependencies.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#122820]">
            <FlaskConical className="h-4 w-4 text-[#2563eb]" /> 实验依赖
          </h4>
          <div className="space-y-2">
            {roadmap.experimentDependencies.map((dep, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-[#2563eb]/12 bg-[#2563eb]/3 px-4 py-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#2563eb]/10 text-xs font-bold text-[#2563eb]">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#122820]">{dep.description}</p>
                  <p className="mt-0.5 text-[11px] text-[#6b7c72]">
                    预计周期: {dep.estimatedDuration} · 阻塞论文: {dep.requiredBy.join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 重新生成 */}
      <div className="flex justify-end border-t border-[#1a5632]/8 pt-4">
        <Button variant="outline" size="sm" className="text-xs" onClick={handleGenerate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          重新生成路线图
        </Button>
      </div>
    </div>
  );
}
