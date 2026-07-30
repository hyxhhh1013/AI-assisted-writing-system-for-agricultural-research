"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CitationReportData {
  gate?: { hint?: string; exportReady?: boolean; passed?: boolean };
  exportReady?: boolean;
  phase5Passed?: boolean;
  grounding?: {
    checkedCount?: number;
    suspiciousCount?: number;
    ungroundableCount?: number;
    hint?: string;
    suspicious?: Array<{
      number?: number;
      overlap?: number;
      citedSentence?: string;
      refTitle?: string;
      reason?: string;
    }>;
  };
}

function parseCitationReport(data: unknown): CitationReportData | null {
  if (!data || typeof data !== "object") return null;
  return data as CitationReportData;
}

/** validate_citations 结果卡片 — 避免埋在执行摘要里 */
export function AgentCitationReportCard({
  summary,
  data,
}: {
  summary?: string;
  data?: unknown;
}) {
  const report = parseCitationReport(data);
  const grounding = report?.grounding;
  const suspicious = grounding?.suspicious ?? [];
  const suspiciousCount = grounding?.suspiciousCount ?? suspicious.length;
  const exportReady = report?.exportReady ?? report?.gate?.exportReady;
  const ok = exportReady !== false && suspiciousCount === 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border text-[13px] shadow-sm shadow-black/[0.02]",
        ok
          ? "border-[#1a5632]/20 bg-[#f6faf7]"
          : "border-amber-200/80 bg-amber-50/40",
      )}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1a5632]" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-[#122820]">
            {ok ? "引用核查通过" : "引用核查完成（需关注）"}
          </p>
          {summary ? (
            <p className="text-[12px] leading-relaxed text-[#3d4f46]">{summary}</p>
          ) : null}
          {grounding ? (
            <p className="text-[11px] text-muted-foreground">
              已检 {grounding.checkedCount ?? 0} 处引用
              {suspiciousCount > 0 ? ` · 可疑 ${suspiciousCount} 处` : ""}
              {(grounding.ungroundableCount ?? 0) > 0
                ? ` · 无法语义对照 ${grounding.ungroundableCount} 处`
                : ""}
            </p>
          ) : null}
        </div>
      </div>
      {suspicious.length > 0 ? (
        <ul className="max-h-48 space-y-2 overflow-y-auto border-t border-amber-200/50 bg-white/60 px-3.5 py-2.5">
          {suspicious.slice(0, 6).map((hit) => (
            <li key={hit.number} className="text-[11px] leading-relaxed text-[#3d4f46]">
              <span className="font-medium text-amber-900">[{hit.number}]</span>
              {hit.refTitle ? (
                <span className="ml-1 text-muted-foreground">
                  {hit.refTitle.length > 48 ? `${hit.refTitle.slice(0, 48)}…` : hit.refTitle}
                </span>
              ) : null}
              {hit.citedSentence ? (
                <p className="mt-0.5 line-clamp-2 text-[#122820]/80">{hit.citedSentence}</p>
              ) : null}
            </li>
          ))}
          {suspiciousCount > 6 ? (
            <li className="text-[10px] text-muted-foreground">
              另有 {suspiciousCount - 6} 处可疑引用，可说「展开全部可疑引用」
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
