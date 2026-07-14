"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ChartConfig, DataSourceSummary, EvidenceClaim } from "@/contracts/data-source";
import { buildPlotPageHref, chartTypeToFigureId } from "@/contracts/figure";
import type { ProjectChartAsset } from "@/contracts/figure";
import { RegisteredChartsCard } from "@/components/shared/plot/registered-charts-card";
import {
  BarChart3,
  Check,
  Copy,
  FileSpreadsheet,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const CLAIM_TYPE_LABELS: Record<string, string> = {
  comparison: "组间比较",
  mean: "均值统计",
  trend: "趋势分析",
  correlation: "相关性",
  model_fit: "模型拟合",
  ranking: "排序",
};

const GROUPED_TYPES = ["comparison", "mean", "trend", "correlation", "model_fit", "ranking"] as const;

interface EvidenceHubSectionsProps {
  claims: EvidenceClaim[];
  summaries: DataSourceSummary[];
  injectionPreview: string;
  chartConfigs: ChartConfig[];
  projectCharts?: ProjectChartAsset[];
  projectId: string;
  isSaving: boolean;
  onUpdateClaim: (id: string, patch: Partial<EvidenceClaim>) => Promise<void>;
  onRemoveClaim: (id: string) => Promise<void>;
  onInsertClaim?: (claimText: string, claimId: string) => void;
  onChartInserted?: (payload: { projectId: string; sectionKey: string }) => void;
}

export function EvidenceHubSections({
  claims,
  summaries,
  injectionPreview,
  chartConfigs,
  projectCharts = [],
  projectId,
  isSaving,
  onUpdateClaim,
  onRemoveClaim,
  onInsertClaim,
  onChartInserted,
}: EvidenceHubSectionsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTolerance, setDraftTolerance] = useState("0.05");

  const startEdit = (id: string, text: string, tolerance: number) => {
    setEditingId(id);
    setDraftText(text);
    setDraftTolerance(String(tolerance));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftText("");
    setDraftTolerance("0.05");
  };

  const saveEdit = async (id: string) => {
    const tolerance = Number(draftTolerance);
    if (!draftText.trim() || Number.isNaN(tolerance)) {
      toast.error("请填写有效的陈述与容差");
      return;
    }
    try {
      await onUpdateClaim(id, { text: draftText.trim(), tolerance });
      cancelEdit();
      toast.success("证据已更新");
    } catch {
      toast.error("保存失败");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">数据源摘要</CardTitle>
          <CardDescription className="text-xs">
            {summaries.length === 0 ? "提取证据后显示" : `${summaries.length} 个数据源`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {summaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-xs">
              <FileSpreadsheet className="h-7 w-7 mb-2 opacity-20" />
              先点击「提取结构化证据」
            </div>
          ) : (
            summaries.map((s) => (
              <div
                key={s.sourceId}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.fileName}</p>
                  <p className="text-muted-foreground">
                    {s.rowCount} 行 · {s.columnCount} 列 · {s.claimCount} 条证据
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {s.sourceId}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">证据声明</CardTitle>
          <CardDescription className="text-xs">
            {claims.length === 0 ? "扩写时将引用 [D*-C*] 编号" : `共 ${claims.length} 条`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[320px] overflow-y-auto">
          {claims.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2 text-center">暂无证据</p>
          ) : (
            GROUPED_TYPES.map((type) => {
              const typeClaims = claims.filter((c) => c.type === type);
              if (typeClaims.length === 0) return null;
              return (
                <div key={type} className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
                    {CLAIM_TYPE_LABELS[type] ?? type}
                    <span className="float-right font-normal">{typeClaims.length} 条</span>
                  </div>
                  <div className="divide-y">
                    {typeClaims.map((claim) => (
                      <div key={claim.id} className="p-2.5 space-y-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {claim.id}
                        </Badge>
                        {editingId === claim.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              className="text-xs min-h-[64px]"
                            />
                            <Input
                              value={draftTolerance}
                              onChange={(e) => setDraftTolerance(e.target.value)}
                              className="h-8 text-xs max-w-[100px]"
                            />
                            <div className="flex gap-1">
                              <Button size="sm" className="h-7 text-[10px]" onClick={() => void saveEdit(claim.id)}>
                                <Check className="h-3 w-3 mr-1" /> 保存
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={cancelEdit}>
                                <X className="h-3 w-3 mr-1" /> 取消
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-[11px] leading-relaxed">{claim.text}</p>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px]"
                                onClick={() => startEdit(claim.id, claim.text, claim.tolerance)}
                              >
                                <Pencil className="h-3 w-3 mr-1" /> 编辑
                              </Button>
                              {onInsertClaim && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px]"
                                  onClick={() => {
                                    onInsertClaim(`${claim.text} [${claim.id}]`, claim.id);
                                    toast.success(`已插入 ${claim.id}`);
                                  }}
                                >
                                  插入正文
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px]"
                                onClick={() => {
                                  void navigator.clipboard.writeText(`[${claim.id}] ${claim.text}`);
                                  toast.success("已复制");
                                }}
                              >
                                <Copy className="h-3 w-3 mr-1" /> 复制
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] text-destructive"
                                disabled={isSaving}
                                onClick={async () => {
                                  try {
                                    await onRemoveClaim(claim.id);
                                    toast.success("已删除");
                                  } catch {
                                    toast.error("删除失败");
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> 删除
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {chartConfigs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" /> 推荐图表
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {chartConfigs.map((cfg, i) => {
              const figureId = chartTypeToFigureId(cfg.type);
              const plotHref = buildPlotPageHref({
                projectId,
                figureId,
                chartIdx: i,
              });
              return (
              <div key={i} className="flex items-center gap-2 p-2 bg-muted/20 rounded-md text-[10px]">
                <span className="flex-1 truncate font-medium">{cfg.title}</span>
                <a href={plotHref} target="_blank" rel="noreferrer" className="text-primary shrink-0">
                  绘图 →
                </a>
              </div>
            );})}
          </CardContent>
        </Card>
      )}

      <RegisteredChartsCard
        projectId={projectId}
        charts={projectCharts}
        onInserted={onChartInserted}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">扩写注入预览</CardTitle>
          <CardDescription className="text-xs">Writer 将看到的 dataClaims 摘要</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-[10px] whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-md p-3 max-h-[140px] overflow-auto font-sans">
            {injectionPreview}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}
