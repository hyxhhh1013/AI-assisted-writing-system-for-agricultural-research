"use client";

import { useState, useCallback } from "react";
import type {
  ReviewReport,
  ReviewDimension,
  ReviewInput,
  FixableReviewReport,
  FixableReviewIssue,
  IssueStatus,
} from "@/types/review";

export interface UseReviewReturn {
  /** 审查报告 */
  report: FixableReviewReport | null;
  /** 是否正在审查 */
  isReviewing: boolean;
  /** 当前进度信息 */
  progress: string;
  /** 错误信息 */
  error: string | null;
  /** 当前正在修复的问题索引 */
  fixingIssueIndex: number | null;

  /** 执行审查 */
  review: (input: ReviewInput, dimensions?: ReviewDimension[]) => Promise<FixableReviewReport | null>;
  /** 修复单个问题 */
  fixIssue: (
    dimension: ReviewDimension,
    issueIndex: number,
    sectionContents: Record<string, string>,
    title: string
  ) => Promise<string | null>;
  /** 接受修复 */
  applyFix: (dimension: ReviewDimension, issueIndex: number) => void;
  /** 忽略问题 */
  dismissIssue: (dimension: ReviewDimension, issueIndex: number) => void;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 将 ReviewReport 转换为 FixableReviewReport
 */
function toFixable(report: ReviewReport): FixableReviewReport {
  const dimensions = {} as FixableReviewReport["dimensions"];

  for (const [dim, result] of Object.entries(report.dimensions)) {
    const dimension = dim as ReviewDimension;
    dimensions[dimension] = {
      ...result,
      issues: result.issues.map((issue) => ({
        ...issue,
        status: "open" as IssueStatus,
      })) as FixableReviewIssue[],
    };
  }

  return {
    ...report,
    dimensions,
  };
}

/**
 * 论文审查 Hook
 *
 * 提供审查、修复、状态管理等功能
 */
export function useReview(): UseReviewReturn {
  const [report, setReport] = useState<FixableReviewReport | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fixingIssueIndex, setFixingIssueIndex] = useState<number | null>(null);

  /**
   * 执行审查
   */
  const review = useCallback(async (
    input: ReviewInput,
    dimensions?: ReviewDimension[]
  ): Promise<FixableReviewReport | null> => {
    setIsReviewing(true);
    setReport(null);
    setError(null);
    setProgress("正在准备审查...");

    try {
      setProgress("正在调用 AI 进行多维度审查，预计需要 30-60 秒...");

      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          dimensions,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "审查失败" }));
        throw new Error(errorData.error || "审查失败");
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "审查失败");
      }

      const fixable = toFixable(data.report);
      setReport(fixable);
      setProgress("审查完成");
      return fixable;
    } catch (err: any) {
      const errorMsg = err.message || "审查失败，请重试";
      setError(errorMsg);
      setProgress("");
      return null;
    } finally {
      setIsReviewing(false);
    }
  }, []);

  /**
   * 修复单个问题
   */
  const fixIssue = useCallback(async (
    dimension: ReviewDimension,
    issueIndex: number,
    sectionContents: Record<string, string>,
    title: string
  ): Promise<string | null> => {
    if (!report) return null;

    const issues = report.dimensions[dimension]?.issues;
    if (!issues || issueIndex < 0 || issueIndex >= issues.length) return null;

    const issue = issues[issueIndex];

    // 设置修复中状态
    setFixingIssueIndex(issueIndex);
    setReport((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        dimensions: {
          ...prev.dimensions,
          [dimension]: {
            ...prev.dimensions[dimension],
            issues: prev.dimensions[dimension].issues.map((iss, i) =>
              i === issueIndex ? { ...iss, status: "fixing" as IssueStatus } : iss
            ),
          },
        },
      };
    });

    try {
      // 调用修复 API（如果需要）
      // 目前简单返回建议文本，后续可以接入 AI 修复
      const fixedContent = issue.suggestion || null;

      // 更新状态
      setReport((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          dimensions: {
            ...prev.dimensions,
            [dimension]: {
              ...prev.dimensions[dimension],
              issues: prev.dimensions[dimension].issues.map((iss, i) =>
                i === issueIndex
                  ? { ...iss, status: "open" as IssueStatus, fixedContent: fixedContent || undefined }
                  : iss
              ),
            },
          },
        };
      });

      return fixedContent;
    } catch (err: any) {
      console.error("[use-review] fixIssue error:", err);
      // 恢复状态
      setReport((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          dimensions: {
            ...prev.dimensions,
            [dimension]: {
              ...prev.dimensions[dimension],
              issues: prev.dimensions[dimension].issues.map((iss, i) =>
                i === issueIndex ? { ...iss, status: "open" as IssueStatus } : iss
              ),
            },
          },
        };
      });
      return null;
    } finally {
      setFixingIssueIndex(null);
    }
  }, [report]);

  /**
   * 接受修复
   */
  const applyFix = useCallback((dimension: ReviewDimension, issueIndex: number) => {
    setReport((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        dimensions: {
          ...prev.dimensions,
          [dimension]: {
            ...prev.dimensions[dimension],
            issues: prev.dimensions[dimension].issues.map((iss, i) =>
              i === issueIndex ? { ...iss, status: "fixed" as IssueStatus } : iss
            ),
          },
        },
      };
    });
  }, []);

  /**
   * 忽略问题
   */
  const dismissIssue = useCallback((dimension: ReviewDimension, issueIndex: number) => {
    setReport((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        dimensions: {
          ...prev.dimensions,
          [dimension]: {
            ...prev.dimensions[dimension],
            issues: prev.dimensions[dimension].issues.map((iss, i) =>
              i === issueIndex ? { ...iss, status: "dismissed" as IssueStatus } : iss
            ),
          },
        },
      };
    });
  }, []);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setReport(null);
    setIsReviewing(false);
    setProgress("");
    setError(null);
    setFixingIssueIndex(null);
  }, []);

  return {
    report,
    isReviewing,
    progress,
    error,
    fixingIssueIndex,
    review,
    fixIssue,
    applyFix,
    dismissIssue,
    reset,
  };
}
