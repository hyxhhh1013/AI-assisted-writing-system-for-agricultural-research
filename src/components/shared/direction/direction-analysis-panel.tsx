"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart3,
  Play,
  Square,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { useDirectionAnalysis } from "@/hooks/use-direction-analysis";
import type { AnalysisDimension } from "@/contracts/direction";

interface DirectionAnalysisPanelProps {
  slug: string;
  hasContract: boolean;
  assetCount: number;
  onAnalysisDone?: () => void;
}

const DIMENSION_NAMES: Record<string, string> = {
  D1: "已有基础盘点", D2: "研究问题框架", D3: "研究缺口识别",
  D4: "数据质量与充分性", D5: "论文机会排序", D6: "实验补全路线",
  D7: "创新性与竞争分析", D8: "跨方向协同机会",
};

const DIMENSION_WEIGHTS: Record<string, number> = {
  D1: 15, D2: 15, D3: 15, D4: 15, D5: 15, D6: 10, D7: 10, D8: 5,
};

const DIMENSION_ORDER = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"];

function confidenceBadge(confidence: string) {
  const map: Record<string, { label: string; className: string }> = {
    high: { label: "高", className: "bg-[#1a5632]/8 text-[#1a5632] border-[#1a5632]/20" },
    medium: { label: "中", className: "bg-[#b8975a]/8 text-[#b8975a] border-[#b8975a]/20" },
    low: { label: "低", className: "bg-red-50 text-red-600 border-red-200" },
  };
  const c = map[confidence] || map.medium;
  return <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", c.className)}>{c.label}</Badge>;
}

export function DirectionAnalysisPanel({
  slug,
  hasContract,
  assetCount,
  onAnalysisDone,
}: DirectionAnalysisPanelProps) {
  const { state, run, cancel, updateDimension } = useDirectionAnalysis();
  const [editingDim, setEditingDim] = useState<string | null>(null);
  const [editScore, setEditScore] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());

  const canRun = assetCount >= 3 && state.status !== "running";
  const totalDimensions = 8;
  const completedDimensions = state.dimensions.size + state.errors.size;
  const progressPct = state.status === "done" ? 100 : Math.round((completedDimensions / totalDimensions) * 100);

  const handleStart = () => {
    const mode = hasContract ? "full" : "quick";
    run(slug, mode).then(() => onAnalysisDone?.());
  };

  const toggleExpand = (dimId: string) => {
    const next = new Set(expandedDims);
    if (next.has(dimId)) next.delete(dimId); else next.add(dimId);
    setExpandedDims(next);
  };

  const startEdit = (dim: AnalysisDimension) => {
    setEditingDim(dim.id);
    setEditScore(String(dim.score));
    setEditSummary(dim.summary);
  };

  const saveEdit = () => {
    if (!editingDim) return;
    updateDimension(editingDim, {
      score: Math.min(10, Math.max(1, parseInt(editScore) || 5)),
      summary: editSummary,
    });
    setEditingDim(null);
  };

  const orderedDimensions = DIMENSION_ORDER
    .map((id) => state.dimensions.get(id))
    .filter(Boolean) as AnalysisDimension[];

  return (
    <div className="space-y-4">
      {/* 控制栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-[#1a5632]" />
          <span className="text-sm font-medium text-[#122820]">
            8 维度分析
          </span>
          {state.status === "running" && (
            <Badge variant="secondary" className="gap-1 border-[#2563eb]/20 bg-[#2563eb]/8 text-[#2563eb]">
              <Loader2 className="h-3 w-3 animate-spin" /> 分析中
            </Badge>
          )}
          {state.status === "done" && (
            <Badge variant="secondary" className="border-[#1a5632]/20 bg-[#1a5632]/8 text-[#1a5632]">
              <Check className="h-3 w-3" /> 已完成
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.status === "running" ? (
            <Button variant="outline" size="sm" className="gap-1 text-xs text-red-500" onClick={cancel}>
              <Square className="h-3 w-3" /> 停止
            </Button>
          ) : (
            <Button
              size="sm"
              className={cn("gap-1 text-xs", siteTheme.btnPrimary)}
              disabled={!canRun}
              onClick={handleStart}
            >
              {state.dimensions.size > 0 ? (
                <><RefreshCw className="h-3 w-3" /> 重新分析</>
              ) : (
                <><Play className="h-3 w-3" /> 开始分析</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {(state.status === "running" || state.status === "done") && (
        <div className="space-y-1">
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-[#9aa8a0]">
            <span>
              {state.status === "running"
                ? `批次 ${state.currentBatch}/3 · ${completedDimensions}/${totalDimensions} 维度`
                : "分析完成"}
            </span>
            <span>{progressPct}%</span>
          </div>
        </div>
      )}

      {/* 维度列表 */}
      <ScrollArea className="h-[480px]">
        <div className="space-y-2 pr-2">
          {orderedDimensions.map((dim) => {
            const isExpanded = expandedDims.has(dim.id);
            const isEditing = editingDim === dim.id;
            const hasWarning = dim.whatTriggersWarn && !dim.whatTriggersBlock;
            const hasBlock = !!dim.whatTriggersBlock;

            return (
              <div
                key={dim.id}
                className={cn(
                  "rounded-lg border transition-colors",
                  hasBlock
                    ? "border-red-200 bg-red-50/50"
                    : hasWarning
                      ? "border-[#b8975a]/30 bg-[#b8975a]/5"
                      : "border-[#1a5632]/8 bg-white",
                )}
              >
                {/* 维度头部 */}
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  onClick={() => toggleExpand(dim.id)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1a5632]/8 text-xs font-bold text-[#1a5632]">
                    {dim.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#122820]">{dim.name}</span>
                      {confidenceBadge(dim.confidence)}
                      {hasBlock && (
                        <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[9px] border-red-200 text-red-600">
                          <AlertTriangle className="h-2.5 w-2.5" /> BLOCK
                        </Badge>
                      )}
                      {hasWarning && !hasBlock && (
                        <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[9px] border-[#b8975a]/30 text-[#b8975a]">
                          <AlertTriangle className="h-2.5 w-2.5" /> WARN
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9aa8a0]">
                      <span>权重 {DIMENSION_WEIGHTS[dim.id] || 0}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-lg font-bold tabular-nums",
                      dim.score >= 7 ? "text-[#1a5632]" : dim.score >= 4 ? "text-[#b8975a]" : "text-red-500",
                    )}>
                      {dim.score}
                    </span>
                    <span className="text-[11px] text-[#9aa8a0]">/10</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-[#9aa8a0]" /> : <ChevronDown className="h-4 w-4 text-[#9aa8a0]" />}
                  </div>
                </button>

                {/* 维度详情 */}
                {isExpanded && (
                  <div className="border-t border-[#1a5632]/8 px-4 py-3 space-y-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#6b7c72]">评分:</span>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={editScore}
                            onChange={(e) => setEditScore(e.target.value)}
                            className="h-7 w-16 text-sm"
                          />
                          <span className="text-xs text-[#9aa8a0]">/10</span>
                        </div>
                        <Textarea
                          value={editSummary}
                          onChange={(e) => setEditSummary(e.target.value)}
                          className="h-24 resize-none text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingDim(null)}>
                            <X className="h-3 w-3 mr-1" /> 取消
                          </Button>
                          <Button size="sm" className="h-7 text-xs" onClick={saveEdit}>
                            <Check className="h-3 w-3 mr-1" /> 保存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed text-[#3d4f46]">{dim.summary}</p>
                        {dim.whatTriggersBlock && (
                          <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span><strong>阻塞:</strong> {dim.whatTriggersBlock}</span>
                          </div>
                        )}
                        {dim.whatTriggersWarn && !dim.whatTriggersBlock && (
                          <div className="flex items-start gap-1.5 rounded-md bg-[#b8975a]/5 px-3 py-2 text-xs text-[#b8975a]">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span><strong>警告:</strong> {dim.whatTriggersWarn}</span>
                          </div>
                        )}
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => startEdit(dim)}
                          >
                            <Pencil className="h-3 w-3 mr-1" /> 编辑
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* 进行中但无结果的维度 */}
          {state.status === "running" &&
            DIMENSION_ORDER.filter(
              (id) => !state.dimensions.has(id) && !state.errors.has(id),
            ).map((id) => (
              <div
                key={id}
                className="flex items-center gap-3 rounded-lg border border-dashed border-[#1a5632]/12 px-4 py-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1a5632]/4 text-xs text-[#1a5632]/40">
                  {id}
                </div>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9aa8a0]" />
                  <span className="text-sm text-[#9aa8a0]">{DIMENSION_NAMES[id] || id} — 等待中...</span>
                </div>
              </div>
            ))}

          {/* 错误 */}
          {state.errors.size > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="text-xs font-medium text-red-600">以下维度分析失败：</p>
              {Array.from(state.errors.entries()).map(([id, err]) => (
                <p key={id} className="mt-1 text-xs text-red-500">
                  {DIMENSION_NAMES[id] || id}: {err}
                </p>
              ))}
            </div>
          )}

          {/* 合成阶段 */}
          {state.synthesis && (
            <div className="rounded-lg border border-[#6366f1]/20 bg-[#6366f1]/[0.03] p-4">
              <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#6366f1]">
                <RefreshCw className="h-4 w-4" /> 跨维度合成校验
              </h4>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs text-[#6b7c72]">综合评分:</span>
                <span className="text-lg font-bold text-[#6366f1]">
                  {state.synthesis.harmonizedScore}
                </span>
                <span className="text-xs text-[#9aa8a0]">/10</span>
              </div>
              <p className="text-sm text-[#3d4f46]">{state.synthesis.summary}</p>
              {state.synthesis.contradictions.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-[#6b7c72]">检测到的矛盾（{state.synthesis.contradictions.length} 项）：</p>
                  {state.synthesis.contradictions.map((c, i) => (
                    <div key={i} className="rounded-md border border-[#b8975a]/20 bg-[#b8975a]/5 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={cn(
                          "h-4 px-1 text-[9px]",
                          c.severity === "high" ? "border-red-200 text-red-600" : "border-[#b8975a]/30 text-[#b8975a]",
                        )}>
                          {c.severity === "high" ? "严重" : c.severity === "medium" ? "中等" : "轻微"}
                        </Badge>
                        <span className="text-xs font-medium text-[#122820]">
                          {c.pair.join(" ↔ ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#6b7c72]">{c.description}</p>
                      <p className="mt-0.5 text-xs font-medium text-[#1a5632]">修正: {c.resolution}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 空状态 */}
          {state.status === "idle" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BarChart3 className="h-8 w-8 text-[#9aa8a0]" />
              <p className="text-sm text-[#9aa8a0]">
                {assetCount < 3
                  ? "需要至少 3 项资产（含 1 个实验）才能触发分析"
                  : "点击「开始分析」启动 8 维度 AI 分析"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
