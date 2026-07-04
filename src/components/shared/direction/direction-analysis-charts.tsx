"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Lightbulb,
} from "lucide-react";
import type {
  AnalysisDimension,
  PaperCandidate,
  RubricResponse,
  SynthesisResult,
} from "@/contracts/direction";

// ==================== 颜色常量 ====================

const DIM_COLORS: Record<string, string> = {
  D1: "#2563eb", D2: "#6366f1", D3: "#8b5cf6", D4: "#059669",
  D5: "#d97706", D6: "#dc2626", D7: "#7c3aed", D8: "#0891b2",
};

const TIER_COLORS = {
  ready: "#059669",
  needs_experiment: "#d97706",
  long_term: "#6b7280",
};

const TIER_LABELS: Record<string, string> = {
  ready: "可立即启动",
  needs_experiment: "需补实验",
  long_term: "远期规划",
};

// ==================== 雷达图 ====================

export function DimensionRadarChart({
  dimensions,
}: {
  dimensions: AnalysisDimension[];
}) {
  if (dimensions.length === 0) return null;

  const data = dimensions.map((d) => ({
    dimension: `${d.id}\n${d.name}`,
    score: d.score,
    fullMark: 10,
  }));

  return (
    <div className="rounded-lg border border-[#1a5632]/10 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-[#122820]">🕸️ 8 维度雷达图</h4>
      <div className="h-80 w-full">
        <ResponsiveContainer>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fontSize: 10, fill: "#6b7c72" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={{ fontSize: 9, fill: "#9aa8a0" }}
              tickCount={6}
            />
            <Radar
              name="评分"
              dataKey="score"
              stroke="#1a5632"
              fill="#1a5632"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {dimensions.map((d) => (
          <div key={d.id} className="flex items-center gap-1 text-[10px]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: DIM_COLORS[d.id] || "#6b7280" }}
            />
            <span className="text-[#6b7c72]">{d.id}: {d.score}/10</span>
            <Badge
              variant="outline"
              className={cn(
                "h-3.5 px-1 text-[8px]",
                d.confidence === "high"
                  ? "border-[#059669]/30 text-[#059669]"
                  : d.confidence === "low"
                    ? "border-[#dc2626]/30 text-[#dc2626]"
                    : "border-[#d97706]/30 text-[#d97706]",
              )}
            >
              {d.confidence === "high" ? "高" : d.confidence === "low" ? "低" : "中"}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 论文候选柱状图 ====================

export function CandidateBarChart({
  candidates,
}: {
  candidates: PaperCandidate[];
}) {
  if (candidates.length === 0) return null;

  const data = candidates
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((c) => ({
      name: (c.title?.length || 0) > 30 ? c.title.slice(0, 28) + "…" : c.title,
      score: c.overallScore,
      tier: c.tier,
      suggestedJournal: c.suggestedJournal || "",
    }));

  return (
    <div className="rounded-lg border border-[#1a5632]/10 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-[#122820]">
        📊 论文候选评分（{candidates.length} 篇）
      </h4>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10, fill: "#9aa8a0" }} />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 10, fill: "#3d4f46" }}
            />
            <Tooltip
              formatter={(value: unknown) => [`${value}/10`, "加权总分"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={22}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={TIER_COLORS[entry.tier] || "#6b7280"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px]">
        {Object.entries(TIER_COLORS).map(([tier, color]) => (
          <div key={tier} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[#6b7c72]">{TIER_LABELS[tier] || tier}</span>
            <span className="text-[#9aa8a0]">
              = {candidates.filter((c) => c.tier === tier).length} 篇
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 证据追溯表（维度分组 Accordion） ====================

export function EvidenceTraceTable({
  dimensions,
}: {
  dimensions: AnalysisDimension[];
}) {
  const dimsWithRubrics = dimensions.filter((d) => d.rubricResponses && d.rubricResponses.length > 0);
  if (dimsWithRubrics.length === 0) return null;

  const allResponses = dimsWithRubrics.flatMap((d) =>
    (d.rubricResponses || []).map((r) => ({ ...r, dimensionId: d.id })),
  );
  const passedCount = allResponses.filter((r) => r.passed).length;
  const passRate = `${Math.round((passedCount / allResponses.length) * 100)}%`;

  return (
    <div className="rounded-lg border border-[#1a5632]/10 bg-white">
      {/* 总览头 */}
      <div className="flex items-center justify-between border-b border-[#1a5632]/8 px-4 py-2.5">
        <h4 className="text-sm font-semibold text-[#122820]">📋 证据追溯</h4>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[#059669] font-medium">{passedCount} ✓</span>
          <span className="text-[#dc2626] font-medium">{allResponses.length - passedCount} ✗</span>
          <div className="h-4 w-[60px] overflow-hidden rounded-full bg-[#f3f4f6]">
            <div
              className="h-full rounded-full bg-[#059669] transition-all"
              style={{ width: passRate }}
            />
          </div>
          <span className="text-[#9aa8a0] tabular-nums">{passRate}</span>
        </div>
      </div>

      {/* 维度分组 Accordion */}
      <div className="max-h-[500px] overflow-y-auto">
        {dimsWithRubrics.map((dim) => {
          const responses = dim.rubricResponses || [];
          const dPassed = responses.filter((r) => r.passed).length;
          const dRate = `${Math.round((dPassed / responses.length) * 100)}%`;

          return (
            <details key={dim.id} className="group border-b border-[#1a5632]/4" open={dim.id === "D1"}>
              {/* 维度头部 — 可点击折叠 */}
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-[#1a5632]/2 list-none">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1a5632]/8 text-[10px] font-bold text-[#1a5632]">
                  {dim.id}
                </span>
                <span className="text-xs font-medium text-[#122820]">{dim.name}</span>
                <div className="ml-auto flex items-center gap-2 text-[10px]">
                  {/* 小型进度条 */}
                  <div className="h-1.5 w-10 overflow-hidden rounded-full bg-[#f3f4f6]">
                    <div
                      className={cn("h-full rounded-full", dPassed === responses.length ? "bg-[#059669]" : "bg-[#d97706]")}
                      style={{ width: dRate }}
                    />
                  </div>
                  <span className={cn("tabular-nums", dPassed === responses.length ? "text-[#059669]" : "text-[#d97706]")}>
                    {dPassed}/{responses.length}
                  </span>
                </div>
              </summary>

              {/* 维度下各行 — 紧凑单行 */}
              <div className="border-t border-[#1a5632]/4">
                {responses.map((r, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 border-b border-[#1a5632]/3 px-4 py-1.5 text-[11px] last:border-0",
                      r.passed ? "bg-[#059669]/1" : "bg-[#dc2626]/2",
                    )}
                  >
                    {/* 状态图标 */}
                    <span className="mt-0.5 shrink-0">
                      {r.passed
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-[#059669]" />
                        : <XCircle className="h-3.5 w-3.5 text-[#dc2626]" />}
                    </span>

                    {/* 解释 + 证据（一行） */}
                    <div className="min-w-0 flex-1">
                      <span className="text-[#3d4f46] leading-snug">{r.explanation}</span>
                      {r.evidence.length > 0 && (
                        <span className="ml-1.5 inline-flex flex-wrap gap-0.5 align-middle">
                          {r.evidence.slice(0, 3).map((ev, j) => (
                            <code key={j} className="inline-block rounded bg-black/[0.04] px-1 py-0 text-[9px] text-[#9aa8a0]">
                              {ev}
                            </code>
                          ))}
                          {r.evidence.length > 3 && (
                            <span className="text-[9px] text-[#9aa8a0]">+{r.evidence.length - 3}</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Rubric ID */}
                    <span className="shrink-0 text-[10px] text-[#9aa8a0]">{r.rubricId}</span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 矛盾面板 ====================

export function ContradictionPanel({
  synthesis,
}: {
  synthesis?: SynthesisResult | null;
}) {
  if (!synthesis || synthesis.contradictions.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#dc2626]/15 bg-white">
      <div className="flex items-center gap-2 border-b border-[#dc2626]/10 px-4 py-3">
        <ArrowRightLeft className="h-4 w-4 text-[#dc2626]" />
        <h4 className="text-sm font-semibold text-[#122820]">跨维度矛盾检测</h4>
        <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-[#dc2626]/20 text-[#dc2626]">
          {synthesis.contradictions.length} 项
        </Badge>
      </div>
      <div className="space-y-3 px-4 py-3">
        {synthesis.contradictions.map((c, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg border p-3",
              c.severity === "high"
                ? "border-[#dc2626]/20 bg-[#dc2626]/3"
                : c.severity === "medium"
                  ? "border-[#d97706]/20 bg-[#d97706]/3"
                  : "border-[#6b7c72]/10 bg-[#f6f5f1]/50",
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "h-4 px-1 text-[9px] font-bold",
                  c.severity === "high"
                    ? "border-[#dc2626]/30 text-[#dc2626]"
                    : c.severity === "medium"
                      ? "border-[#d97706]/30 text-[#d97706]"
                      : "border-[#6b7c72]/30 text-[#6b7c72]",
                )}
              >
                {c.severity === "high" ? "严重" : c.severity === "medium" ? "中等" : "轻微"}
              </Badge>
              <span className="text-xs font-medium text-[#122820]">
                {c.pair[0]} ↔ {c.pair[1]}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[#3d4f46]">{c.description}</p>
            <div className="mt-2 flex items-start gap-1.5 rounded-md bg-white/80 px-3 py-2">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-[#2563eb]" />
              <p className="text-[11px] leading-relaxed text-[#2563eb]">{c.resolution}</p>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between rounded-lg border border-[#1a5632]/10 bg-white px-4 py-2.5">
          <span className="text-xs text-[#6b7c72]">
            综合调和评分
          </span>
          <span className={cn(
            "text-lg font-bold",
            synthesis.harmonizedScore >= 7
              ? "text-[#059669]"
              : synthesis.harmonizedScore >= 4
                ? "text-[#d97706]"
                : "text-[#dc2626]",
          )}>
            {synthesis.harmonizedScore.toFixed(1)}
            <span className="text-[10px] font-normal text-[#9aa8a0]">/10</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ==================== 执行摘要 ====================

export function ExecutiveSummary({
  dimensions,
  synthesis,
  candidateCount,
}: {
  dimensions: AnalysisDimension[];
  synthesis?: SynthesisResult | null;
  candidateCount: number;
}) {
  if (dimensions.length === 0) return null;

  const avgScore =
    dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
  const blocked = dimensions.filter((d) => d.whatTriggersBlock).length;
  const warned = dimensions.filter((d) => d.whatTriggersWarn && !d.whatTriggersBlock).length;
  const lowConfidence = dimensions.filter((d) => d.confidence === "low").length;

  return (
    <div className="rounded-lg border border-[#1a5632]/10 bg-gradient-to-r from-[#1a5632]/3 to-transparent p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h4 className="text-base font-bold text-[#122820]">📊 方向分析报告</h4>
          <p className="text-xs text-[#6b7c72]">
            8 维度综合评分 · {candidateCount} 篇论文候选识别
          </p>
        </div>
        <div className="text-right">
          <div className={cn(
            "text-3xl font-bold",
            avgScore >= 7 ? "text-[#059669]" : avgScore >= 4 ? "text-[#d97706]" : "text-[#dc2626]",
          )}>
            {synthesis?.harmonizedScore.toFixed(1) || avgScore.toFixed(1)}
          </div>
          <div className="text-[10px] text-[#9aa8a0]">综合评分 /10</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <StatBadge label={`${blocked} 项阻塞`} color="#dc2626" />
        <StatBadge label={`${warned} 项警告`} color="#d97706" />
        <StatBadge label={`${lowConfidence} 项低置信度`} color="#6b7280" />
        <StatBadge label={`${dimensions.length} 维度完成`} color="#1a5632" />
      </div>
    </div>
  );
}

function StatBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${color}12`, color, border: `1px solid ${color}30` }}
    >
      {label}
    </span>
  );
}
