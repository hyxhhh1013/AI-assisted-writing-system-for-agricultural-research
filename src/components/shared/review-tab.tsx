"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  ClipboardList,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReview } from "@/hooks/use-review";
import { patchSection } from "@/services/review";
import type {
  ReviewReport,
  ReviewDimension,
  FixableReviewIssue,
  FixableReviewReport,
  ReviewIssue,
  IssueStatus,
} from "@/types/review";

import type { ProjectWritingMode } from "@/contracts/writing-mode";

// ==================== 常量 ====================

const RESEARCH_DIMENSIONS: Array<{ id: ReviewDimension; name: string; icon: string; description: string }> = [
  { id: "academic", name: "学术规范", icon: "📝", description: "口语化、术语一致性、句式规范" },
  { id: "argument", name: "论证质量", icon: "💡", description: "论点论据、推理链、因果关系" },
  { id: "structure", name: "结构规范", icon: "🏗️", description: "章节完整性、图表引用、摘要" },
  { id: "integrity", name: "学术诚信", icon: "🔒", description: "引用真实性、数据一致性、统计方法" },
];

const REVIEW_DIMENSIONS: Array<{ id: ReviewDimension; name: string; icon: string; description: string }> = [
  { id: "academic", name: "学术规范", icon: "📝", description: "口语化、术语一致性、综述体例" },
  { id: "argument", name: "论证质量", icon: "💡", description: "综合对比、批判性、数据归因" },
  { id: "structure", name: "结构规范", icon: "🏗️", description: "综述章节完整性、摘要与展望" },
  { id: "integrity", name: "学术诚信", icon: "🔒", description: "照搬原文、数据归属、未标注来源" },
];

function getDimensionsForMode(mode?: ProjectWritingMode) {
  return mode === "research" ? RESEARCH_DIMENSIONS : REVIEW_DIMENSIONS;
}

const SEVERITY_CONFIG = {
  high: { color: "bg-red-100 text-red-800", icon: XCircle, label: "高" },
  medium: { color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle, label: "中" },
  low: { color: "bg-green-100 text-green-800", icon: CheckCircle2, label: "低" },
};

const GRADE_CONFIG = {
  A: { color: "text-green-600", label: "优秀" },
  B: { color: "text-blue-600", label: "良好" },
  C: { color: "text-yellow-600", label: "一般" },
  D: { color: "text-red-600", label: "较差" },
};

// ==================== 属性 ====================

interface ReviewTabProps {
  title: string;
  sections: Array<{ key: string; title: string; content: string }>;
  outline?: string;
  references?: string[];
  projectId?: string;
  projectMode?: ProjectWritingMode;
  onJumpToSection?: (sectionKey: string) => void;
  /** 质量中心宽屏布局：维度卡片 + 双栏结果 */
  variant?: "default" | "workspace";
  /** 从 DB 恢复的审查报告 */
  initialReport?: FixableReviewReport | null;
  onReportSaved?: (reviewId: string) => void;
}

// ==================== 组件 ====================

export function ReviewTab({
  title,
  sections,
  outline,
  references,
  projectId,
  projectMode,
  onJumpToSection,
  variant = "default",
  initialReport,
  onReportSaved,
}: ReviewTabProps) {
  const isWorkspace = variant === "workspace";
  const dimensions = useMemo(() => getDimensionsForMode(projectMode), [projectMode]);

  const {
    report,
    isReviewing,
    progress,
    error,
    review,
    fixIssue,
    applyFix,
    dismissIssue,
    reset,
    restoreReport,
  } = useReview();

  const [selectedDimensions, setSelectedDimensions] = useState<ReviewDimension[]>(
    () => dimensions.map((d) => d.id),
  );
  const [expandedDimensions, setExpandedDimensions] = useState<Set<ReviewDimension>>(
    new Set()
  );

  useEffect(() => {
    if (initialReport) {
      restoreReport(initialReport);
      const dimsToExpand = new Set<ReviewDimension>();
      for (const dim of ["academic", "argument", "structure", "integrity"] as ReviewDimension[]) {
        if (initialReport.dimensions[dim].issueCount > 0) dimsToExpand.add(dim);
      }
      setExpandedDimensions(dimsToExpand);
    }
  }, [initialReport, restoreReport]);

  // 构建真实的 sectionContents 映射（修复之前传 {} 的 bug）
  const sectionContents = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sections) {
      map[s.key] = s.content;
    }
    return map;
  }, [sections]);

  // 执行审查
  const handleReview = async () => {
    if (sections.length === 0) {
      toast.error("请先输入论文内容");
      return;
    }

    const result = await review(
      {
        title,
        sections,
        outline,
        references,
        projectMode,
        config: { projectMode },
      },
      selectedDimensions,
    );

    if (result) {
      toast.success("审查完成");
      if (result.reviewId) onReportSaved?.(result.reviewId);
      // 自动展开有问题的维度
      const dimsToExpand = new Set<ReviewDimension>();
      for (const dim of selectedDimensions) {
        if (result.dimensions[dim].issueCount > 0) {
          dimsToExpand.add(dim);
        }
      }
      setExpandedDimensions(dimsToExpand);
    }
  };

  // 切换维度展开
  const toggleDimension = (dim: ReviewDimension) => {
    setExpandedDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) {
        next.delete(dim);
      } else {
        next.add(dim);
      }
      return next;
    });
  };

  // 渲染评分环
  const renderScoreRing = (score: number, grade: "A" | "B" | "C" | "D") => {
    const config = GRADE_CONFIG[grade];
    return (
      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="35"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              className="text-muted"
            />
            <circle
              cx="40"
              cy="40"
              r="35"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              strokeDasharray={`${(score / 100) * 220} 220`}
              className={config.color}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${config.color}`}>{score}</span>
          </div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${config.color}`}>{grade}</div>
          <div className="text-sm text-muted-foreground">{config.label}</div>
        </div>
      </div>
    );
  };

  // 渲染问题项
  const renderIssue = (
    issue: FixableReviewIssue | (ReviewIssue & { status?: IssueStatus }),
    dimension: ReviewDimension,
    index: number
  ) => {
    const severityConfig = SEVERITY_CONFIG[issue.severity];
    const SeverityIcon = severityConfig.icon;
    const issueStatus = (issue as FixableReviewIssue).status || "open";
    const fixedContent = (issue as FixableReviewIssue).fixedContent;

    return (
      <div
        key={issue.id}
        className={`p-3 rounded-lg border ${
          issueStatus === "fixed"
            ? "bg-green-50 border-green-200"
            : issueStatus === "dismissed"
            ? "bg-muted/50 border-muted"
            : "bg-background border-border"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={severityConfig.color}>
                <SeverityIcon className="w-3 h-3 mr-1" />
                {severityConfig.label}
              </Badge>
              <Badge variant="secondary">{issue.type}</Badge>
              {issueStatus === "fixed" && (
                <Badge variant="outline" className="bg-green-100 text-green-800">
                  已修复
                </Badge>
              )}
              {issueStatus === "dismissed" && (
                <Badge variant="outline">已忽略</Badge>
              )}
            </div>
            <p className="text-sm mb-1">{issue.description}</p>
            <p className="text-xs text-muted-foreground mb-2">
              📍 {issue.location}
            </p>
            {issue.originalText && (
              <div className="text-xs bg-muted p-2 rounded mb-2">
                <span className="font-medium">原文：</span>
                {issue.originalText}
              </div>
            )}
            {issue.suggestion && (
              <div className="text-xs bg-blue-50 p-2 rounded">
                <span className="font-medium">建议：</span>
                {issue.suggestion}
              </div>
            )}
            {fixedContent && (
              <div className="text-xs bg-green-50 p-2 rounded mt-2">
                <span className="font-medium">修复内容：</span>
                {fixedContent}
              </div>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        {issueStatus === "open" && (
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fixIssue(dimension, index, sectionContents, title)}
            >
              修复
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismissIssue(dimension, index)}
            >
              忽略
            </Button>
          </div>
        )}
        {issueStatus === "open" && fixedContent && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                applyFix(dimension, index);
                // 写回：尝试匹配 issue.location 到 section key
                if (projectId) {
                  const locSection = sections.find(s =>
                    issue.location?.includes(s.key) || issue.location?.includes(s.title)
                  );
                  const targetKey = locSection?.key || sections[0]?.key;
                  if (targetKey) {
                    patchSection(projectId, targetKey, fixedContent).then(() => {
                      toast.success(`已写入 ${targetKey} 章节`);
                    }).catch((e: unknown) => {
                      toast.error(e instanceof Error ? e.message : "保存失败");
                    });
                  }
                }
              }}
            >
              接受修复
            </Button>
          </div>
        )}
      </div>
    );
  };

  const modeDescription =
    projectMode === "research"
      ? "对原创研究论文进行学术规范、论证质量、结构规范、学术诚信四个维度的全面审查"
      : "对文献综述进行引用规范、转述质量、综合论证与学术诚信审查（侧重照搬与数据归属）";

  const totalWords = sections.reduce((n, s) => n + s.content.length, 0);

  const toggleDimensionSelection = (dimId: ReviewDimension) => {
    setSelectedDimensions((prev) =>
      prev.includes(dimId) ? prev.filter((d) => d !== dimId) : [...prev, dimId],
    );
  };

  const setupBlock = isWorkspace ? (
    <div className="rounded-2xl border border-[#1a5632]/12 bg-gradient-to-br from-white to-[#f6f5f1]/80">
      <div className="border-b border-[#1a5632]/10 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a5632]/10">
                <ClipboardList className="h-4 w-4 text-[#1a5632]" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#122820]">论文审查</h2>
                <p className="text-[11px] text-[#6b7c72]">{modeDescription}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px] font-normal">
                {title || "未命名论文"}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                {sections.length} 章 · {totalWords.toLocaleString()} 字
              </Badge>
              {references && references.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  {references.length} 条参考文献
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="lg"
              className="bg-[#1a5632] hover:bg-[#144a2a]"
              onClick={handleReview}
              disabled={isReviewing || selectedDimensions.length === 0}
            >
              {isReviewing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  审查中…
                </>
              ) : (
                "开始审查"
              )}
            </Button>
            {report && (
              <Button size="lg" variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                重新审查
              </Button>
            )}
          </div>
        </div>
        {progress && <p className="mt-3 text-xs text-[#6b7c72]">{progress}</p>}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      <div className="p-5 sm:p-6">
        <p className="mb-3 text-xs font-semibold text-[#122820]">选择审查维度</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dimensions.map((dim) => {
            const selected = selectedDimensions.includes(dim.id);
            const dimResult = report?.dimensions[dim.id];
            return (
              <button
                key={dim.id}
                type="button"
                onClick={() => toggleDimensionSelection(dim.id)}
                className={cn(
                  "relative flex flex-col rounded-xl border p-4 text-left transition-all",
                  selected
                    ? "border-[#1a5632] bg-[#1a5632]/5 shadow-sm ring-1 ring-[#1a5632]/20"
                    : "border-[#1a5632]/10 bg-white hover:border-[#1a5632]/25",
                )}
              >
                <span className="text-xl">{dim.icon}</span>
                <span className="mt-2 text-sm font-semibold text-[#122820]">{dim.name}</span>
                <span className="mt-1 text-[11px] leading-relaxed text-[#6b7c72]">{dim.description}</span>
                {dimResult && (
                  <span className={cn("mt-2 text-xs font-medium", GRADE_CONFIG[dimResult.grade].color)}>
                    {dimResult.score} 分 · {dimResult.issueCount} 项
                  </span>
                )}
                <span
                  className={cn(
                    "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                    selected ? "border-[#1a5632] bg-[#1a5632] text-white" : "border-[#1a5632]/30 bg-white",
                  )}
                >
                  {selected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>📋 论文审查</CardTitle>
        <CardDescription>{modeDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">选择审查维度</label>
          <div className="flex flex-wrap gap-3">
            {dimensions.map((dim) => (
              <label key={dim.id} className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={selectedDimensions.includes(dim.id)}
                  onCheckedChange={(checked) => {
                    setSelectedDimensions((prev) =>
                      checked ? [...prev, dim.id] : prev.filter((d) => d !== dim.id),
                    );
                  }}
                />
                <span>{dim.icon} {dim.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mb-4 text-sm text-muted-foreground">
          <p>📄 论文标题：{title || "未设置"}</p>
          <p>📝 章节数量：{sections.length}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleReview} disabled={isReviewing || selectedDimensions.length === 0}>
            {isReviewing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                审查中...
              </>
            ) : (
              "开始审查"
            )}
          </Button>
          {report && (
            <Button variant="outline" onClick={reset}>重新审查</Button>
          )}
        </div>
        {progress && <p className="mt-3 text-sm text-muted-foreground">{progress}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );

  const dimensionCards = dimensions
    .filter((d) => selectedDimensions.includes(d.id))
    .map((dim) => {
      if (!report) return null;
      const result = report.dimensions[dim.id];
      const isExpanded = expandedDimensions.has(dim.id);

      return (
        <Card key={dim.id} className={isWorkspace ? "border-[#1a5632]/10 shadow-sm" : undefined}>
          <CardHeader className="cursor-pointer" onClick={() => toggleDimension(dim.id)}>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                {dim.icon} {dim.name}
                <Badge variant="secondary">{result.issueCount} 个问题</Badge>
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className={cn("text-lg font-bold", GRADE_CONFIG[result.grade].color)}>
                  {result.score} 分
                </span>
                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
            <CardDescription>{dim.description}</CardDescription>
          </CardHeader>
          {isExpanded && (
            <CardContent>
              {result.basis.length > 0 && (
                <div className="mb-4 text-sm">
                  <span className="font-medium">打分依据：</span>
                  {result.basis.join("；")}
                </div>
              )}
              {result.issues.length > 0 ? (
                <div className="space-y-3">
                  {result.issues.map((issue, index) => renderIssue(issue, dim.id, index))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">✅ 未发现问题</p>
              )}
            </CardContent>
          )}
        </Card>
      );
    });

  const resultsBlock = report ? (
    isWorkspace ? (
      <div className="mt-5 grid gap-5 xl:grid-cols-[280px_1fr]">
        <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
          <Card className="border-[#1a5632]/10 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">综合评分</CardTitle>
            </CardHeader>
            <CardContent>
              {renderScoreRing(report.overallScore, report.overallGrade)}
              {report.synopsis && (
                <div className="mt-4 border-t border-[#1a5632]/10 pt-3">
                  <h4 className="mb-1 text-xs font-medium text-[#122820]">论文概要</h4>
                  <p className="text-[11px] leading-relaxed text-[#6b7c72]">{report.synopsis}</p>
                </div>
              )}
              {report.summary && (
                <div className="mt-3">
                  <h4 className="mb-1 text-xs font-medium text-[#122820]">总体评价</h4>
                  <p className="text-[11px] leading-relaxed text-[#6b7c72]">{report.summary}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="rounded-xl border border-[#1a5632]/10 bg-[#faf9f6] p-3">
            <p className="text-[10px] font-medium text-[#122820]">维度得分</p>
            <ul className="mt-2 space-y-1.5">
              {dimensions.filter((d) => selectedDimensions.includes(d.id)).map((dim) => {
                const r = report.dimensions[dim.id];
                return (
                  <li key={dim.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-[#3d4f46]">{dim.icon} {dim.name}</span>
                    <span className={cn("font-semibold tabular-nums", GRADE_CONFIG[r.grade].color)}>
                      {r.score}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="min-w-0 space-y-4">{dimensionCards}</div>
      </div>
    ) : (
      <>
        <Card>
          <CardHeader><CardTitle>综合评分</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              {renderScoreRing(report.overallScore, report.overallGrade)}
              <div className="flex-1">
                {report.synopsis && (
                  <div className="mb-3">
                    <h4 className="mb-1 text-sm font-medium">论文概要</h4>
                    <p className="text-sm text-muted-foreground">{report.synopsis}</p>
                  </div>
                )}
                {report.summary && (
                  <div>
                    <h4 className="mb-1 text-sm font-medium">总体评价</h4>
                    <p className="text-sm text-muted-foreground">{report.summary}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        {dimensionCards}
      </>
    )
  ) : isWorkspace ? (
    <div className="mt-5 rounded-xl border border-dashed border-[#1a5632]/20 bg-[#faf9f6]/60 px-6 py-12 text-center">
      <FileText className="mx-auto mb-3 h-10 w-10 text-[#1a5632]/25" />
      <p className="text-sm font-medium text-[#122820]">选择维度后点击「开始审查」</p>
      <p className="mt-1 text-xs text-[#6b7c72]">
        AI 将从学术规范、论证质量、结构规范、学术诚信四个维度生成可操作的修改建议
      </p>
    </div>
  ) : null;

  return (
    <div className={cn(isWorkspace ? "h-full min-h-0" : "space-y-6")}>
      {setupBlock}
      {resultsBlock}
    </div>
  );
}
