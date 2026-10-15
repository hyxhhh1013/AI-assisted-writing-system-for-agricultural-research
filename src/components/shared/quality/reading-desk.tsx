"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/error-utils";
import type { PlagiarismCheckResult, PlagiarismMatchResult, PlagiarismMatchType, RewriteSuggestion } from "@/contracts/plagiarism";
import type { FixableReviewReport, ReviewDimension } from "@/contracts/review";
import { displayedOverlap } from "@/lib/plagiarism-coverage";
import {
  applyAcceptedRewritesToSections,
  placeMatchesInContent,
  presentMatchDetail,
} from "@/lib/plagiarism-utils";
import { anchorReviewReport, buildCheckContentFromSections, type AnchoredReviewIssue, type QualitySection } from "@/lib/quality-sections";
import { ReviewIssueCard } from "@/components/shared/review/review-issue-card";
import { rewriteMatch, updateRewriteSuggestion } from "@/services/plagiarism";
import { QualityCheckProgress } from "@/components/shared/quality/quality-progress";
import {
  MATCH_TYPE_LABELS,
  STRATEGY_LABELS,
} from "@/components/shared/plagiarism/constants";
import type { PlagiarismStage } from "@/hooks/use-plagiarism-check";

const FILTERS: Array<{ id: "all" | PlagiarismMatchType; label: string }> = [
  { id: "all", label: "全部" },
  { id: "self", label: "自引" },
  { id: "cross", label: "跨项目" },
  { id: "local", label: "知识库" },
  { id: "web", label: "联网" },
];

function highlightClass(risk: PlagiarismMatchResult["riskLevel"], selected: boolean): string {
  const tone = risk === "high"
    ? "bg-[#f4b4ae] text-[#3b1210]"
    : risk === "medium"
      ? "bg-[#f3d98a] text-[#3b2c08]"
      : "bg-[#d5e6cf] text-[#16301f]";
  return cn(tone, "rounded-sm px-0.5", selected && "outline outline-2 outline-offset-1 outline-[#1a5632]");
}

function styleNoteCopy(match: PlagiarismMatchResult): { title: string; detail: string } {
  const title = presentMatchDetail(match.sourceText).replace(/^【[^】]+】/, "").trim();
  const detail = presentMatchDetail(match.matchedText).trim();
  return {
    title: title || match.matchedFrom,
    detail: detail && detail !== title ? detail : "",
  };
}

function reviewPieces(
  text: string,
  partStart: number,
  match: PlagiarismMatchResult | null | undefined,
  reviews: AnchoredReviewIssue[],
): Array<{ text: string; match: PlagiarismMatchResult | null; reviewId?: string }> {
  const bound = match ?? null;
  const ranges = reviews.flatMap((mark) => {
    if (!mark.placed || typeof mark.offset !== "number" || typeof mark.length !== "number") return [];
    const start = Math.max(0, mark.offset - partStart);
    const end = Math.min(text.length, mark.offset + mark.length - partStart);
    if (end <= start) return [];
    return [{ id: mark.id, start, end }];
  }).sort((left, right) => left.start - right.start || right.end - left.end);

  const pieces: Array<{ text: string; match: PlagiarismMatchResult | null; reviewId?: string }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) pieces.push({ text: text.slice(cursor, range.start), match: bound });
    pieces.push({ text: text.slice(range.start, range.end), match: bound, reviewId: range.id });
    cursor = range.end;
  }
  if (cursor < text.length || pieces.length === 0) {
    pieces.push({ text: text.slice(cursor), match: bound });
  }
  return pieces;
}

export interface ReadingDeskProps {
  hasProject: boolean;
  content: string;
  result: PlagiarismCheckResult | null;
  previousOverlap: number | null;
  checking: boolean;
  stage: PlagiarismStage | null;
  error: string | null;
  webSearch: boolean;
  onWebSearch: (value: boolean) => void;
  projects: Array<{ id: string; title: string }>;
  selectedProjectId: string;
  loadingProject: boolean;
  onLoadProject: (id: string) => void;
  onCheck: () => void;
  onCancel: () => void;
  sections: QualitySection[];
  scope: "full" | string;
  onSaveToProject?: (updated: QualitySection[], changedKeys: string[]) => Promise<void>;
  onApplied: (newContent: string, hint?: { sections?: QualitySection[]; label: string }) => void;
  reviewOpen: boolean;
  onOpenReview: () => void;
  onCloseReview: () => void;
  reviewReport?: FixableReviewReport | null;
  reviewRunning?: boolean;
  reviewProgress?: string;
  onRunReview?: () => void;
  projectId?: string;
  onFixReviewIssue?: (dimension: ReviewDimension, index: number) => void;
  onDismissReviewIssue?: (dimension: ReviewDimension, index: number) => void;
  onApplyReviewIssue?: (dimension: ReviewDimension, index: number) => void;
}

export function ReadingDesk({
  hasProject,
  content,
  result,
  previousOverlap,
  checking,
  stage,
  error,
  webSearch,
  onWebSearch,
  projects,
  selectedProjectId,
  loadingProject,
  onLoadProject,
  onCheck,
  onCancel,
  sections,
  scope,
  onSaveToProject,
  onApplied,
  reviewOpen,
  onOpenReview,
  onCloseReview,
  reviewReport = null,
  reviewRunning = false,
  reviewProgress = "",
  onRunReview,
  projectId,
  onFixReviewIssue,
  onDismissReviewIssue,
  onApplyReviewIssue,
}: ReadingDeskProps) {
  const [typeFilter, setTypeFilter] = useState<"all" | PlagiarismMatchType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, RewriteSuggestion[]>>({});
  const [ignored, setIgnored] = useState<Record<string, boolean>>({});
  const [rewriting, setRewriting] = useState(false);
  const [saving, setSaving] = useState(false);

  const matches = result?.matches ?? [];
  const styleNotes = useMemo(
    () => matches.filter((match) => match.matchType === "ai"),
    [matches],
  );
  const literalMatches = useMemo(
    () => matches.filter((match) => match.matchType !== "ai" && (typeFilter === "all" || match.matchType === typeFilter)),
    [matches, typeFilter],
  );
  const literalTypeCount = useMemo(
    () => new Set(matches.filter((match) => match.matchType !== "ai").map((match) => match.matchType)).size,
    [matches],
  );
  const placed = useMemo(
    () => placeMatchesInContent(content, literalMatches),
    [content, literalMatches],
  );
  const reviewAnchors = useMemo(
    () => (reviewReport ? anchorReviewReport(content, sections, reviewReport) : []),
    [content, sections, reviewReport],
  );
  const placedReviews = reviewAnchors.filter((item) => item.placed && typeof item.offset === "number");
  const unplacedReviews = reviewAnchors.filter((item) => !item.placed);
  const selected = literalMatches.find((match) => match.id === selectedId) ?? null;
  const selectedIndex = selected ? literalMatches.findIndex((match) => match.id === selected.id) : -1;
  const selectedReview = reviewAnchors.find((item) => item.id === selectedReviewId) ?? null;
  const overlap = result ? displayedOverlap(result) : null;
  const canRewrite = Boolean(
    selected
    && selected.riskLevel !== "low"
    && selected.matchType !== "ai"
    && !ignored[selected.id],
  );

  useEffect(() => {
    setSelectedId(null);
    setSelectedReviewId(null);
    setSuggestions({});
    setIgnored({});
  }, [result?.checkId]);

  useEffect(() => {
    if (!selectedId) return;
    const node = document.querySelector(`[data-match-id="${CSS.escape(selectedId)}"]`);
    node?.scrollIntoView?.({ block: "center" });
  }, [selectedId]);

  useEffect(() => {
    if (!selectedReviewId) return;
    const node = document.querySelector(`[data-review-id="${CSS.escape(selectedReviewId)}"]`);
    node?.scrollIntoView?.({ block: "center" });
  }, [selectedReviewId]);

  const choose = (id: string, scroll: boolean) => {
    setSelectedId(id);
    setSelectedReviewId(null);
    if (reviewOpen) onCloseReview();
    if (!scroll) return;
    const node = document.querySelector(`[data-match-id="${CSS.escape(id)}"]`);
    node?.scrollIntoView?.({ block: "center" });
  };

  const openReviewIssue = (id: string) => {
    setSelectedReviewId(id);
    setSelectedId(null);
    if (!reviewOpen) onOpenReview();
    const node = document.querySelector(`[data-review-id="${CSS.escape(id)}"]`);
    node?.scrollIntoView?.({ block: "center" });
  };

  const generate = async () => {
    if (!selected || !result) return;
    setRewriting(true);
    try {
      const rows = await rewriteMatch({
        checkId: result.checkId,
        matchId: selected.id,
        originalText: selected.sourceText,
      });
      setSuggestions((prev) => ({ ...prev, [selected.id]: rows }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "生成改写失败");
    } finally {
      setRewriting(false);
    }
  };

  const ignore = async () => {
    if (!selected) return;
    const row = suggestions[selected.id]?.find((item) => item.id);
    try {
      if (row?.id) {
        await updateRewriteSuggestion({ suggestionId: row.id, status: "rejected" });
      }
      setIgnored((prev) => ({ ...prev, [selected.id]: true }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "忽略失败");
    }
  };

  const adopt = async (suggestion: RewriteSuggestion) => {
    if (!selected || !suggestion.suggestedText || suggestion.suggestedText === selected.sourceText) return;
    if (!onSaveToProject || sections.length === 0) {
      toast.error("没有可写回的项目章节");
      return;
    }
    const accepted = { [`${selected.id}-${suggestion.strategy}`]: true };
    const bag = { [selected.id]: [suggestion] };
    const { sections: updated, changedKeys } = applyAcceptedRewritesToSections(
      sections,
      [selected],
      bag,
      accepted,
    );
    if (changedKeys.length === 0) {
      toast.error("没有可写回的章节变更");
      return;
    }
    setSaving(true);
    try {
      await onSaveToProject(updated, changedKeys);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "写回项目失败");
      return;
    } finally {
      setSaving(false);
    }
    if (suggestion.id) {
      try {
        await updateRewriteSuggestion({ suggestionId: suggestion.id, status: "accepted" });
      } catch (err: unknown) {
        toast.error(err instanceof Error ? getErrorMessage(err) : "正文已写回，建议状态未更新");
      }
    }
    const changed = updated.filter((section) => changedKeys.includes(section.key));
    const label = changed.length === 1 ? (changed[0]?.title ?? "本章") : `${changed.length}章`;
    onApplied(buildCheckContentFromSections(updated, scope), { sections: changed, label });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#1a5632]/10 px-4 py-2.5">
        {overlap ? (
          <p className="text-sm text-[#122820]">
            字面重合{" "}
            <span className={cn(
              "font-semibold tabular-nums",
              result?.overallRisk === "high" ? "text-red-700" : result?.overallRisk === "medium" ? "text-amber-700" : "text-[#1a5632]",
            )}>
              {(overlap.value * 100).toFixed(1)}%
            </span>
            <span className="text-[#6b7c72]">
              {literalMatches.length === 0 ? " · 没有对上的句子" : ` · ${literalMatches.length} 处`}
            </span>
          </p>
        ) : (
          <span className="text-sm font-medium text-[#122820]">尚未检测</span>
        )}
        {overlap?.legacy && <span className="text-[11px] text-[#9aa8a0]">旧口径</span>}
        {typeof previousOverlap === "number" && overlap && !overlap.legacy && (
          <span className="text-[11px] text-[#6b7c72]">上次 {(previousOverlap * 100).toFixed(1)}%</span>
        )}
        {result?.aiStatus === "failed" && (
          <span className="text-[11px] text-amber-700">文风未完成</span>
        )}
        {reviewReport && (
          <span className="rounded-full bg-[#2457c5]/10 px-2 py-0.5 text-[11px] font-medium text-[#2457c5]">
            审查 {reviewReport.overallScore} 分
          </span>
        )}
        <span className="flex-1" />
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenReview}>
          审查
        </Button>
        {checking ? (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
            取消
          </Button>
        ) : (
          <Button type="button" size="sm" className="h-7 bg-[#1a5632] text-xs hover:bg-[#144a2a]" onClick={onCheck} disabled={!hasProject || !content.trim()}>
            <Search className="mr-1 h-3.5 w-3.5" />
            {result ? "再查一次" : "开始检测"}
          </Button>
        )}
      </div>

      {!hasProject && (
        <div className="border-b border-[#1a5632]/10 px-4 py-2">
          <select
            className="w-full bg-transparent text-sm outline-none"
            value={selectedProjectId}
            disabled={loadingProject}
            onChange={(event) => onLoadProject(event.target.value)}
          >
            <option value="">选择要检测的项目…</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
        </div>
      )}

      {(result?.warnings?.length ?? 0) > 0 && (
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
          {result?.warnings?.join("；")}
        </p>
      )}
      {error && (
        <p className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-1.5 text-[11px] text-red-700">{error}</p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4">
          {content.trim() ? (
            <article className="mx-auto max-w-[42rem] whitespace-pre-wrap py-6 text-[15px] leading-8 text-[#1c1917]">
              {(() => {
                const nodes: ReactNode[] = [];
                let cursor = 0;
                placed.parts.forEach((part, index) => {
                  const pieces = reviewPieces(part.text, cursor, part.match, placedReviews);
                  pieces.forEach((piece, pieceIndex) => {
                    if (!piece.text) return;
                    const key = `${index}-${pieceIndex}`;
                    if (!piece.match && !piece.reviewId) {
                      nodes.push(<span key={key}>{piece.text}</span>);
                      return;
                    }
                    const reviewSelected = piece.reviewId != null && piece.reviewId === selectedReviewId;
                    nodes.push(
                      <button
                        key={key}
                        type="button"
                        data-match-id={piece.match?.id}
                        data-review-id={piece.reviewId}
                        className={cn(
                          piece.match && highlightClass(piece.match.riskLevel, piece.match.id === selectedId),
                          piece.reviewId && "underline decoration-2 decoration-[#2457c5] underline-offset-4",
                          reviewSelected && "bg-[#2457c5]/10",
                        )}
                        onClick={() => {
                          if (piece.reviewId && (reviewOpen || !piece.match)) {
                            openReviewIssue(piece.reviewId);
                            return;
                          }
                          if (piece.match) choose(piece.match.id, true);
                        }}
                      >
                        {piece.text}
                      </button>,
                    );
                  });
                  cursor += part.text.length;
                });
                return nodes;
              })()}
            </article>
          ) : (
            <p className="py-16 text-center text-sm text-[#6b7c72]">
              {hasProject ? "这个项目还没有可检测的章节。" : "先选择项目，系统会按章节加载正文。"}
            </p>
          )}
        </div>

        <aside className="flex max-h-[46vh] min-h-0 w-full shrink-0 flex-col overflow-y-auto border-t border-[#1a5632]/10 lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0">
          {checking && (
            <div className="p-3">
              <QualityCheckProgress checking={checking} stage={stage} />
            </div>
          )}
          {reviewRunning && (
            <p className="px-3 pt-3 text-xs text-[#2457c5]">{reviewProgress || "正在审查…"}</p>
          )}
          {selectedReview ? (
            <div className="p-3">
              <ReviewIssueCard
                issue={selectedReview.issue}
                dimension={selectedReview.dimension}
                index={selectedReview.index}
                sections={sections}
                projectId={projectId}
                applyLabel="写入本章"
                onFix={() => onFixReviewIssue?.(selectedReview.dimension, selectedReview.index)}
                onDismiss={() => onDismissReviewIssue?.(selectedReview.dimension, selectedReview.index)}
                onApply={() => onApplyReviewIssue?.(selectedReview.dimension, selectedReview.index)}
              />
            </div>
          ) : selected ? (
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-[#6b7c72]">第 {selectedIndex + 1} 处，共 {literalMatches.length} 处</p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={selectedIndex <= 0}
                    onClick={() => {
                      const prev = literalMatches[selectedIndex - 1];
                      if (prev) choose(prev.id, true);
                    }}
                  >
                    上一处
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={selectedIndex < 0 || selectedIndex >= literalMatches.length - 1}
                    onClick={() => {
                      const next = literalMatches[selectedIndex + 1];
                      if (next) choose(next.id, true);
                    }}
                  >
                    下一处
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-[11px] text-[#6b7c72]">{MATCH_TYPE_LABELS[selected.matchType]} · 和这篇的重合 {(selected.similarity * 100).toFixed(0)}%</p>
                {selected.matchedUrl ? (
                  <a href={selected.matchedUrl} target="_blank" rel="noreferrer" className="mt-1 block text-base font-medium text-[#1a5632] underline">
                    {selected.matchedFrom}
                  </a>
                ) : (
                  <p className="mt-1 text-base font-medium text-[#122820]">{selected.matchedFrom}</p>
                )}
              </div>
              <div>
                <p className="text-[11px] text-[#9aa8a0]">文献里的句子</p>
                <p className="mt-1 text-sm leading-7 text-[#3d4f46]">{selected.matchedText}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#9aa8a0]">你的句子</p>
                <p className="mt-1 text-sm leading-7 text-[#122820]">{selected.sourceText}</p>
              </div>
              {canRewrite && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="h-7 bg-[#1a5632] text-xs hover:bg-[#144a2a]" disabled={rewriting || saving} onClick={() => void generate()}>
                    {rewriting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    改写
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => void ignore()}>
                    忽略
                  </Button>
                </div>
              )}
              {ignored[selected.id] && <p className="text-[11px] text-[#6b7c72]">已忽略</p>}
              {(suggestions[selected.id] ?? []).map((suggestion) => (
                <div key={`${selected.id}-${suggestion.strategy}`} className="rounded-lg border border-[#1a5632]/10 p-2">
                  <p className="text-[10px] text-[#9aa8a0]">{STRATEGY_LABELS[suggestion.strategy] ?? suggestion.strategy}</p>
                  <p className="mt-1 text-sm leading-6 text-[#122820]">{suggestion.suggestedText}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    disabled={saving}
                    onClick={() => void adopt(suggestion)}
                  >
                    {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    采用并写回
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4 text-sm text-[#6b7c72]">
              {result && literalMatches.length === 0 ? (
                <p className="text-[#122820]">文献库、文内和跨项目都没有对上的句子。百分比只统计这些。</p>
              ) : (
                <p>{reviewOpen ? "点一句带下划线的审查意见。" : "点一句带颜色的文字，右侧显示来源。"}</p>
              )}
              {reviewOpen && onRunReview && (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 w-fit bg-[#1a5632] text-xs hover:bg-[#144a2a]"
                  disabled={reviewRunning}
                  onClick={onRunReview}
                >
                  {reviewRunning ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {reviewReport ? "再审一次" : "开始审查"}
                </Button>
              )}
              {reviewOpen && !onRunReview && (
                <p className="text-xs text-[#122820]">审查需要绑定项目章节。</p>
              )}
              {!result && (
                <label className="flex items-center gap-2 text-xs text-[#122820]">
                  <input
                    type="checkbox"
                    checked={webSearch}
                    onChange={(event) => onWebSearch(event.target.checked)}
                  />
                  联网搜索（默认关）
                </label>
              )}
            </div>
          )}

          {placed.unplaced.length > 0 && (
            <div className="border-t border-[#1a5632]/10 p-3">
              <p className="mb-2 text-[10px] font-medium text-[#9aa8a0]">未定位</p>
              <ul className="flex flex-col gap-1.5">
                {placed.unplaced.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-xs",
                        match.id === selectedId ? "bg-[#1a5632]/10" : "hover:bg-[#f6f5f1]",
                      )}
                      onClick={() => choose(match.id, false)}
                    >
                      <span className="text-[#9aa8a0]">{MATCH_TYPE_LABELS[match.matchType]} · </span>
                      {match.matchedFrom}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unplacedReviews.length > 0 && (
            <div className="border-t border-[#1a5632]/10 p-3">
              <p className="mb-2 text-[10px] font-medium text-[#9aa8a0]">审查未定位</p>
              <ul className="flex flex-col gap-1.5">
                {unplacedReviews.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-xs",
                        item.id === selectedReviewId ? "bg-[#2457c5]/10" : "hover:bg-[#f6f5f1]",
                      )}
                      onClick={() => openReviewIssue(item.id)}
                    >
                      {item.issue.description || item.issue.location || "未定位意见"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {styleNotes.length > 0 && (
            <div className="border-t border-[#1a5632]/10 p-4">
              <p className="text-[11px] font-medium text-[#6b7c72]">文风提示 · 不计入字面重合</p>
              <ul className="mt-3 flex flex-col gap-3">
                {styleNotes.map((note) => {
                  const copy = styleNoteCopy(note);
                  return (
                    <li key={note.id}>
                      <p className="text-[11px] text-[#9aa8a0]">{note.matchedFrom}</p>
                      <p className="mt-1 text-sm leading-6 text-[#122820]">{copy.title}</p>
                      {copy.detail && (
                        <p className="mt-1 text-sm leading-6 text-[#3d4f46]">{copy.detail}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {literalTypeCount > 1 && (
            <div className="mt-auto flex flex-wrap gap-1 border-t border-[#1a5632]/10 p-3">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px]",
                    typeFilter === filter.id ? "bg-[#1a5632] text-white" : "bg-[#f4f1ea] text-[#6b7c72]",
                  )}
                  onClick={() => setTypeFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
