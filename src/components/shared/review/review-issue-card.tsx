"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { patchSection } from "@/services/review";
import { toast } from "sonner";
import { resolveIssueSectionKey } from "@/lib/quality-sections";
import type { FixableReviewIssue, IssueStatus, ReviewDimension, ReviewIssue } from "@/contracts/review";

const SEVERITY_CONFIG = {
  high: { color: "bg-red-100 text-red-800", icon: XCircle, label: "高" },
  medium: { color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle, label: "中" },
  low: { color: "bg-green-100 text-green-800", icon: CheckCircle2, label: "低" },
};

interface ReviewIssueCardProps {
  issue: FixableReviewIssue | (ReviewIssue & { status?: IssueStatus; fixedContent?: string });
  dimension: ReviewDimension;
  index: number;
  sections: Array<{ key: string; title: string; content: string }>;
  projectId?: string;
  onFix: () => void;
  onDismiss: () => void;
  onApply: () => void;
}

export function ReviewIssueCard({
  issue,
  dimension: _dimension,
  index: _index,
  sections,
  projectId,
  onFix,
  onDismiss,
  onApply,
}: ReviewIssueCardProps) {
  const severityConfig = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.medium;
  const SeverityIcon = severityConfig.icon;
  const issueStatus = (issue as FixableReviewIssue).status || "open";
  const fixedContent = (issue as FixableReviewIssue).fixedContent;
  const mappedKey = resolveIssueSectionKey(issue, sections);
  const mappedTitle = sections.find((s) => s.key === mappedKey)?.title;

  const handleApply = () => {
    onApply();
    if (!projectId || !fixedContent) return;
    const targetKey = mappedKey ?? sections[0]?.key;
    if (!targetKey) return;
    patchSection(projectId, targetKey, fixedContent).then(() => {
      toast.success(`已写入「${mappedTitle ?? targetKey}」`);
    }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : "保存失败");
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        issueStatus === "fixed"
          ? "border-green-200 bg-green-50"
          : issueStatus === "dismissed"
            ? "border-muted bg-muted/50"
            : "border-border bg-background",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className={severityConfig.color}>
          <SeverityIcon className="mr-1 h-3 w-3" />
          {severityConfig.label}
        </Badge>
        <Badge variant="secondary">{issue.type}</Badge>
        {issueStatus === "fixed" && (
          <Badge variant="outline" className="bg-green-100 text-green-800">已修复</Badge>
        )}
        {issueStatus === "dismissed" && <Badge variant="outline">已忽略</Badge>}
        {issueStatus === "fixing" && (
          <Badge variant="outline">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            生成中
          </Badge>
        )}
      </div>
      <p className="mb-1 text-sm">{issue.description}</p>
      <p className="mb-2 text-xs text-[#6b7c72]">
        {issue.location}
        {mappedTitle && <span className="ml-1 text-[#1a5632]">→ {mappedTitle}</span>}
      </p>
      {issue.originalText && (
        <div className="mb-2 rounded bg-muted p-2 text-xs">
          <span className="font-medium">原文：</span>
          {issue.originalText}
        </div>
      )}
      {issue.suggestion && (
        <div className="rounded bg-blue-50 p-2 text-xs">
          <span className="font-medium">建议：</span>
          {issue.suggestion}
        </div>
      )}
      {fixedContent && (
        <div className="mt-2 rounded bg-green-50 p-2 text-xs">
          <span className="font-medium">修复稿：</span>
          {fixedContent}
        </div>
      )}

      {issueStatus === "open" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={onFix}>生成修复</Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>忽略</Button>
        </div>
      )}
      {issueStatus === "open" && fixedContent && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="bg-[#1a5632] hover:bg-[#144a2a]" onClick={handleApply}>
            接受并写回章节
          </Button>
        </div>
      )}
    </div>
  );
}
