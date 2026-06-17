"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, CheckCircle2, Loader2, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-utils";
import { applyAcceptedRewritesToContent } from "@/lib/plagiarism-utils";
import { rewriteMatch, updateRewriteSuggestion } from "@/services/plagiarism";
import type { PlagiarismMatchResult, RewriteSuggestion } from "@/contracts/plagiarism";
import { STRATEGY_LABELS } from "./constants";

interface PlagiarismRewriteViewProps {
  checkId: string;
  matches: PlagiarismMatchResult[];
  fullContent: string;
  compact?: boolean;
  onBack?: () => void;
  onApplied: (newContent: string) => void;
}

export function PlagiarismRewriteView({
  checkId,
  matches,
  fullContent,
  compact = false,
  onBack,
  onApplied,
}: PlagiarismRewriteViewProps) {
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, RewriteSuggestion[]>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean | undefined>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const highRisk = matches.filter((m) => m.riskLevel !== "low");
  const hasAccepted = Object.values(accepted).some((v) => v === true);

  const doRewrite = async (m: PlagiarismMatchResult) => {
    setRewriting(m.id);
    try {
      const rows = await rewriteMatch({ checkId, matchId: m.id, originalText: m.sourceText });
      setSuggestions((p) => ({ ...p, [m.id]: rows }));
      toast.success("改写建议已生成");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "改写失败");
    } finally {
      setRewriting(null);
    }
  };

  const accept = (mid: string, s: RewriteSuggestion) => {
    if (s.id) updateRewriteSuggestion({ suggestionId: s.id, status: "accepted" }).catch(() => {});
    navigator.clipboard.writeText(s.suggestedText).then(() => {
      setCopiedId(`${mid}-${s.strategy}`);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
    setAccepted((p) => ({ ...p, [`${mid}-${s.strategy}`]: true }));
    toast.success("已采纳并复制");
  };

  const reject = (mid: string, s: RewriteSuggestion) => {
    if (s.id) updateRewriteSuggestion({ suggestionId: s.id, status: "rejected" }).catch(() => {});
    setAccepted((p) => ({ ...p, [`${mid}-${s.strategy}`]: false }));
  };

  const applyAndRecheck = () => {
    const next = applyAcceptedRewritesToContent(fullContent, matches, suggestions, accepted);
    onApplied(next);
  };

  if (highRisk.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center text-muted-foreground", compact ? "h-full" : "py-16")}>
        <CheckCircle2 className={cn("text-green-500", compact ? "mb-1 h-6 w-6" : "mb-2 h-8 w-8")} />
        <p className={compact ? "text-xs" : "text-sm"}>没有需要降重的内容</p>
        {onBack && (
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={onBack}>
            返回
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", compact ? "h-full gap-2.5" : "gap-2")}>
      <div className={cn("flex shrink-0 items-center justify-between", compact ? "" : "")}>
        <span className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          <Sparkles className={cn("inline text-primary/60", compact ? "mr-1 h-3 w-3" : "mr-1 h-4 w-4")} />
          {highRisk.length} 处需要降重
        </span>
        <div className="flex items-center gap-2">
          {hasAccepted && !compact && (
            <Button size="sm" onClick={applyAndRecheck}>
              <Search className="mr-1 h-3.5 w-3.5" />
              应用改写并重新查重
            </Button>
          )}
          {onBack && (
            <Button variant="ghost" size="sm" className={compact ? "h-6 text-[10px]" : ""} onClick={onBack}>
              返回
            </Button>
          )}
        </div>
      </div>

      <div className={cn(compact ? "min-h-0 flex-1 overflow-y-auto -mx-1 px-1" : "")}>
        <div className={compact ? "space-y-2" : "space-y-0"}>
          {highRisk.map((m, i) => (
            <div key={m.id} className="rounded-lg border bg-card">
              <div className={cn("flex items-center", compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2")}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>#{i + 1}</span>
                <p className={cn("flex-1 truncate text-muted-foreground", compact ? "text-xs" : "text-sm")}>
                  {m.sourceText.slice(0, compact ? 45 : 60)}...
                </p>
                <Badge variant="outline" className={cn("tabular-nums text-red-500", compact ? "h-4 px-1 text-[10px]" : "text-xs")}>
                  {(m.similarity * 100).toFixed(0)}%
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className={compact ? "h-6 text-[10px]" : "text-sm"}
                  onClick={() => doRewrite(m)}
                  disabled={rewriting === m.id}
                >
                  {rewriting === m.id ? (
                    <Loader2 className={cn("animate-spin", compact ? "h-2.5 w-2.5" : "mr-1 h-3 w-3")} />
                  ) : (
                    <Sparkles className={cn(compact ? "h-2.5 w-2.5" : "mr-1 h-3 w-3")} />
                  )}
                  {!compact && (rewriting === m.id ? "生成中" : "降重")}
                </Button>
              </div>
              {suggestions[m.id]?.map((s, si) => {
                const k = `${m.id}-${s.strategy}`;
                const isA = accepted[k] === true;
                const isR = accepted[k] === false;
                const isC = copiedId === k;
                return (
                  <div
                    key={si}
                    className={cn(
                      "border leading-relaxed transition-colors",
                      compact ? "mx-1.5 mb-1.5 rounded p-1.5 text-[11px]" : "mx-2 mb-2 rounded-lg p-2.5 text-sm",
                      isA ? "border-green-200 bg-green-50" : isR ? "border-border bg-muted/20 opacity-40" : "border-border bg-muted/20",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={compact ? "h-3.5 px-1 text-[9px]" : "text-[10px]"}>
                          {STRATEGY_LABELS[s.strategy] ?? s.strategy}
                        </Badge>
                        {s.similarityAfter != null && s.similarityAfter < 1 && (
                          <span className={cn("tabular-nums text-green-600", compact ? "text-[9px]" : "text-[10px]")}>
                            自比 {(s.similarityAfter * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {!isA && !isR && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("text-green-600", compact ? "h-5 px-1.5 text-[9px]" : "h-6 px-2 text-[10px]")}
                              onClick={() => accept(m.id, s)}
                            >
                              <Check className={compact ? "mr-0.5 h-2.5 w-2.5" : "mr-0.5 h-3 w-3"} />
                              采纳
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("text-muted-foreground", compact ? "h-5 px-1.5 text-[9px]" : "h-6 px-2 text-[10px]")}
                              onClick={() => reject(m.id, s)}
                            >
                              <X className={compact ? "mr-0.5 h-2.5 w-2.5" : "mr-0.5 h-3 w-3"} />
                              忽略
                            </Button>
                          </>
                        )}
                        {isA && <span className={cn("text-green-600", compact ? "text-[9px]" : "text-[10px]")}>{isC ? "已复制 ✓" : "已采纳"}</span>}
                        {isR && <span className={cn("text-muted-foreground", compact ? "text-[9px]" : "text-[10px]")}>已忽略</span>}
                      </div>
                    </div>
                    <p className={isR ? "text-muted-foreground line-through" : ""}>{s.suggestedText}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {hasAccepted && (
        <div className={cn("shrink-0 border-t", compact ? "pt-1.5" : "pt-2")}>
          <Button size="sm" className={cn(compact ? "h-7 w-full text-xs" : "")} onClick={applyAndRecheck}>
            <Search className={compact ? "mr-1 h-3 w-3" : "mr-1.5 h-3.5 w-3.5"} />
            应用改写并重新查重
          </Button>
        </div>
      )}
    </div>
  );
}
