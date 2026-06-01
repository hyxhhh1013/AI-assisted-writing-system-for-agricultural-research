"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getHistory, getDetail } from "@/services/review";
import type { ReviewHistoryItem, ReviewDetailResponse } from "@/contracts/review";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ==================== 常量 ====================

const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: "text-green-600", bg: "bg-green-50", label: "优秀" },
  B: { color: "text-blue-600", bg: "bg-blue-50", label: "良好" },
  C: { color: "text-amber-600", bg: "bg-amber-50", label: "一般" },
  D: { color: "text-red-600", bg: "bg-red-50", label: "较差" },
};

const SEVERITY_CONFIG = {
  high: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: XCircle, label: "高" },
  medium: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: AlertTriangle, label: "中" },
  low: { color: "text-green-600", bg: "bg-green-50", border: "border-green-200", icon: CheckCircle2, label: "低" },
} as const;

const DIM_LABELS: Record<string, string> = {
  academic: "学术规范",
  argument: "论证质量",
  structure: "结构规范",
  integrity: "学术诚信",
};

// ==================== 类型 ====================

interface ReviewHistoryListProps {
  projectId?: string | null;
  /** 点击历史项时的回调（可选，用于外部控制选中态） */
  onSelect?: (item: ReviewHistoryItem) => void;
  className?: string;
}

// ==================== 子组件 ====================

function ScoreBadge({ score, grade }: { score: number | null; grade: string | null }) {
  const config = grade ? GRADE_CONFIG[grade] : undefined;
  return (
    <div className="flex items-center gap-1.5">
      {config && (
        <span className={cn("text-xs font-semibold", config.color)}>{config.label}</span>
      )}
      <span className={cn(
        "text-sm font-bold tabular-nums",
        config?.color ?? "text-[#6b7c72]"
      )}>
        {score ?? "—"}
      </span>
      {grade && (
        <span className={cn(
          "inline-flex items-center justify-center rounded px-1 py-0.5 text-[11px] font-bold",
          config?.bg ?? "bg-muted",
          config?.color ?? "text-muted-foreground"
        )}>
          {grade}
        </span>
      )}
    </div>
  );
}

function ScoreRing({ score, grade, size = 56 }: { score: number; grade: string; size?: number }) {
  const config = GRADE_CONFIG[grade] ?? GRADE_CONFIG.B;
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="currentColor" strokeWidth="5" fill="none"
          className="text-[#1a5632]/10"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="currentColor" strokeWidth="5" fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          className={config.color.replace("text-", "stroke-")}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-sm font-bold", config.color)}>{score}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[#6b7c72]">
      <FileText className="h-10 w-10 mb-3 opacity-20" />
      <p className="text-sm font-medium">暂无审查记录</p>
      <p className="text-[11px] mt-1 opacity-70">完成一次论文审查后，记录将显示在这里</p>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[#1a5632]/10 bg-white p-4 space-y-3 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-[#1a5632]/10" />
          <div className="flex gap-4">
            <div className="h-4 w-20 rounded bg-[#1a5632]/8" />
            <div className="h-4 w-16 rounded bg-[#1a5632]/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== 主组件 ====================

export function ReviewHistoryList({ projectId, onSelect, className }: ReviewHistoryListProps) {
  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 加载历史列表
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getHistory(projectId ?? undefined)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
          toast.error("加载审查历史失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  // 切换展开 → 加载详情
  const toggleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }

    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);

    try {
      const data = await getDetail(id);
      setDetail(data);
    } catch (err: unknown) {
      toast.error("加载审查详情失败");
      setExpandedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [expandedId]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("zh-CN", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return d;
    }
  };

  // 按维度分组 issues
  const groupedIssues = (detail?.issues ?? []).reduce<Record<string, ReviewDetailResponse["issues"]>>((acc, issue) => {
    const dim = issue.dimension || "other";
    (acc[dim] ??= []).push(issue);
    return acc;
  }, {});

  if (loading) return <HistorySkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#6b7c72]">
        <AlertCircle className="h-10 w-10 mb-3 text-red-400/60" />
        <p className="text-sm font-medium">加载失败</p>
        <p className="text-[11px] mt-1 opacity-70">{error}</p>
        <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={() => window.location.reload()}>
          重试
        </Button>
      </div>
    );
  }

  if (items.length === 0) return <EmptyState />;

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="space-y-2 p-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6b7c72] px-1 mb-3">
          审查历史 ({items.length})
        </p>

        {items.map((item) => {
          const isExpanded = expandedId === item.id;
          const gradeCfg = item.overallGrade ? GRADE_CONFIG[item.overallGrade] : undefined;

          return (
            <div key={item.id}>
              {/* 列表项 */}
              <button
                onClick={() => {
                  onSelect?.(item);
                  toggleExpand(item.id);
                }}
                className={cn(
                  "w-full text-left rounded-xl border transition-all",
                  isExpanded
                    ? "border-[#1a5632]/20 bg-white shadow-sm rounded-b-none"
                    : "border-[#1a5632]/10 bg-white hover:border-[#1a5632]/20 hover:shadow-sm",
                )}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* 迷你评分环 */}
                  {item.overallScore != null && item.overallGrade ? (
                    <ScoreRing score={item.overallScore} grade={item.overallGrade} size={40} />
                  ) : (
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1a5632]/5">
                      <TrendingUp className="h-4 w-4 text-[#1a5632]/40" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#122820] truncate">
                      {item.title || "未命名审查"}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-[11px] text-[#9aa8a0]">
                        <Clock className="h-3 w-3" />
                        {formatDate(item.createdAt)}
                      </span>
                      {gradeCfg && (
                        <Badge variant="outline" className={cn("text-[10px] py-0", gradeCfg.bg, gradeCfg.color)}>
                          {gradeCfg.label}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 分数 + 展开图标 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.overallScore != null && (
                      <span className={cn("text-sm font-bold tabular-nums", gradeCfg?.color ?? "text-[#6b7c72]")}>
                        {item.overallScore}分
                      </span>
                    )}
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-[#1a5632]/50" />
                      : <ChevronDown className="h-4 w-4 text-[#1a5632]/30" />
                    }
                  </div>
                </div>

                {/* 概要预览（折叠时） */}
                {!isExpanded && item.synopsis && (
                  <div className="px-4 pb-3">
                    <p className="text-[11px] text-[#6b7c72] line-clamp-2 leading-relaxed">
                      {item.synopsis}
                    </p>
                  </div>
                )}
              </button>

              {/* 展开的详情 */}
              {isExpanded && (
                <div className="border-x border-b border-[#1a5632]/20 rounded-b-xl bg-[#faf9f6]">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-[#1a5632]/40" />
                      <span className="ml-2 text-sm text-[#6b7c72]">加载详情...</span>
                    </div>
                  ) : detail ? (
                    <div className="p-4 space-y-4">
                      {/* 概要 + 总结 */}
                      {(detail.check.synopsis || detail.check.summary) && (
                        <div className="rounded-lg bg-white border border-[#1a5632]/8 p-3 space-y-2">
                          {detail.check.synopsis && (
                            <div>
                              <span className="text-[10px] font-semibold uppercase text-[#1a5632]/60">概要</span>
                              <p className="text-xs text-[#3d4f46] mt-0.5 leading-relaxed">{detail.check.synopsis}</p>
                            </div>
                          )}
                          {detail.check.summary && (
                            <div>
                              <span className="text-[10px] font-semibold uppercase text-[#1a5632]/60">总体评价</span>
                              <p className="text-xs text-[#3d4f46] mt-0.5 leading-relaxed">{detail.check.summary}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 按维度分组的问题 */}
                      {Object.keys(groupedIssues).length > 0 ? (
                        Object.entries(groupedIssues).map(([dim, issues]) => (
                          <div key={dim} className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase text-[#1a5632]/60 flex items-center gap-2">
                              {DIM_LABELS[dim] || dim}
                              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                {issues.length}
                              </Badge>
                            </p>
                            <div className="space-y-2">
                              {issues.map((issue, idx) => {
                                const sev = SEVERITY_CONFIG[issue.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.low;
                                const SevIcon = sev.icon;
                                return (
                                  <div
                                    key={issue.id || idx}
                                    className={cn("rounded-lg border px-3 py-2 text-xs", sev.bg, sev.border)}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="outline" className={cn("text-[10px] py-0", sev.color, sev.bg)}>
                                        <SevIcon className="h-3 w-3 mr-0.5" />
                                        {sev.label}
                                      </Badge>
                                      <Badge variant="secondary" className="text-[10px] py-0">
                                        {issue.type}
                                      </Badge>
                                      {issue.location && (
                                        <span className="text-[10px] text-[#9aa8a0]">{issue.location}</span>
                                      )}
                                    </div>
                                    <p className="text-[#3d4f46] leading-relaxed">{issue.description}</p>
                                    {issue.suggestion && (
                                      <p className="mt-1 text-[#1a5632] bg-[#1a5632]/5 rounded px-2 py-1 text-[10px] leading-relaxed">
                                        💡 {issue.suggestion}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-xs text-[#9aa8a0] py-6">
                          ✅ 未发现问题
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
