"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { useReview } from "@/hooks/use-review";
import { patchSection } from "@/services/review";
import type {
  ReviewReport,
  ReviewDimension,
  FixableReviewIssue,
  ReviewIssue,
  IssueStatus,
} from "@/types/review";

// ==================== 常量 ====================

const DIMENSIONS: Array<{ id: ReviewDimension; name: string; icon: string; description: string }> = [
  { id: "academic", name: "学术规范", icon: "📝", description: "口语化、术语一致性、句式规范" },
  { id: "argument", name: "论证质量", icon: "💡", description: "论点论据、推理链、因果关系" },
  { id: "structure", name: "结构规范", icon: "🏗️", description: "章节完整性、图表引用、摘要" },
  { id: "integrity", name: "学术诚信", icon: "🔒", description: "引用真实性、数据一致性、统计" },
];

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
  onJumpToSection?: (sectionKey: string) => void;
}

// ==================== 组件 ====================

export function ReviewTab({
  title,
  sections,
  outline,
  references,
  projectId,
  onJumpToSection,
}: ReviewTabProps) {
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
  } = useReview();

  const [selectedDimensions, setSelectedDimensions] = useState<ReviewDimension[]>(
    DIMENSIONS.map((d) => d.id)
  );
  const [expandedDimensions, setExpandedDimensions] = useState<Set<ReviewDimension>>(
    new Set()
  );

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
      },
      selectedDimensions
    );

    if (result) {
      toast.success("审查完成");
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

  return (
    <div className="space-y-6">
      {/* 输入区 */}
      <Card>
        <CardHeader>
          <CardTitle>📋 论文审查</CardTitle>
          <CardDescription>
            对论文进行学术规范、论证质量、结构规范、学术诚信四个维度的全面审查
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 维度选择 */}
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">选择审查维度</label>
            <div className="flex flex-wrap gap-3">
              {DIMENSIONS.map((dim) => (
                <label
                  key={dim.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedDimensions.includes(dim.id)}
                    onCheckedChange={(checked) => {
                      setSelectedDimensions((prev) =>
                        checked
                          ? [...prev, dim.id]
                          : prev.filter((d) => d !== dim.id)
                      );
                    }}
                  />
                  <span>
                    {dim.icon} {dim.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* 内容摘要 */}
          <div className="mb-4 text-sm text-muted-foreground">
            <p>📄 论文标题：{title || "未设置"}</p>
            <p>📝 章节数量：{sections.length}</p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button
              onClick={handleReview}
              disabled={isReviewing || selectedDimensions.length === 0}
            >
              {isReviewing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  审查中...
                </>
              ) : (
                "开始审查"
              )}
            </Button>
            {report && (
              <Button variant="outline" onClick={reset}>
                重新审查
              </Button>
            )}
          </div>

          {/* 进度信息 */}
          {progress && (
            <p className="text-sm text-muted-foreground mt-3">{progress}</p>
          )}

          {/* 错误信息 */}
          {error && (
            <p className="text-sm text-destructive mt-3">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* 审查结果 */}
      {report && (
        <>
          {/* 综合评分 */}
          <Card>
            <CardHeader>
              <CardTitle>综合评分</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                {renderScoreRing(report.overallScore, report.overallGrade)}
                <div className="flex-1">
                  {report.synopsis && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium mb-1">论文概要</h4>
                      <p className="text-sm text-muted-foreground">
                        {report.synopsis}
                      </p>
                    </div>
                  )}
                  {report.summary && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">总体评价</h4>
                      <p className="text-sm text-muted-foreground">
                        {report.summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 各维度详情 */}
          {DIMENSIONS.filter((d) => selectedDimensions.includes(d.id)).map((dim) => {
            const result = report.dimensions[dim.id];
            const isExpanded = expandedDimensions.has(dim.id);

            return (
              <Card key={dim.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => toggleDimension(dim.id)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {dim.icon} {dim.name}
                      <Badge variant="secondary">{result.issueCount} 个问题</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-4">
                      <span className={`text-lg font-bold ${GRADE_CONFIG[result.grade].color}`}>
                        {result.score} 分
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                  <CardDescription>{dim.description}</CardDescription>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    {/* 打分依据 */}
                    {result.basis.length > 0 && (
                      <div className="mb-4 text-sm">
                        <span className="font-medium">打分依据：</span>
                        {result.basis.join("；")}
                      </div>
                    )}

                    {/* 问题列表 */}
                    {result.issues.length > 0 ? (
                      <div className="space-y-3">
                        {result.issues.map((issue, index) =>
                          renderIssue(issue, dim.id, index)
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        ✅ 未发现问题
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
