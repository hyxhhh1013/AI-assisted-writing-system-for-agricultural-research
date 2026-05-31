"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ProjectData } from "@/contracts/project";
import { useEvidence } from "@/hooks/use-evidence";
import {
  Database,
  Loader2,
  Upload,
  Trash2,
  Pencil,
  Check,
  X,
  Copy,
  FileSpreadsheet,
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

interface EvidencePanelProps {
  projectId: string;
  project: Pick<ProjectData, "dataClaims" | "dataSources" | "mode">;
  onSaved?: (patch: { dataClaims?: string; dataSources?: string }) => void;
  onInsertClaim?: (claimText: string, claimId: string) => void;
}

export function EvidencePanel({
  projectId,
  project,
  onSaved,
  onInsertClaim,
}: EvidencePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTolerance, setDraftTolerance] = useState("0.05");

  const {
    claims,
    summaries,
    injectionPreview,
    isSaving,
    isAnalyzing,
    error,
    updateClaim,
    removeClaim,
    uploadAndAnalyze,
  } = useEvidence({ projectId, project, onSaved });

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
      await updateClaim(id, { text: draftText.trim(), tolerance });
      cancelEdit();
      toast.success("证据已更新");
    } catch {
      toast.error("保存失败");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await uploadAndAnalyze(file);
      toast.success(`已分析 ${file.name} 并保存证据`);
    } catch {
      toast.error("上传分析失败");
    }
  };

  const groupedTypes = ["comparison", "mean", "trend", "correlation", "model_fit", "ranking"] as const;

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 p-4 overflow-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            数据证据中心
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            上传 CSV / Excel，自动提取可引用证据；扩写与一致性检查会读取此处数据。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.tsv"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5"
            disabled={isAnalyzing || isSaving}
            onClick={() => fileInputRef.current?.click()}
          >
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            上传并分析
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">数据源摘要</CardTitle>
          <CardDescription className="text-xs">
            {summaries.length === 0 ? "尚未上传数据文件" : `${summaries.length} 个数据源`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {summaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs">
              <FileSpreadsheet className="h-8 w-8 mb-2 opacity-20" />
              上传 CSV 或 Excel 后在此显示行列统计
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

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">证据声明</CardTitle>
          <CardDescription className="text-xs">
            {claims.length === 0 ? "暂无证据" : `共 ${claims.length} 条，可按类型编辑或插入正文`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto space-y-3">
          {claims.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-4 text-center">
              分析完成后证据会出现在这里
            </p>
          ) : (
            groupedTypes.map((type) => {
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
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {claim.id}
                          </Badge>
                          {claim.pValue !== undefined && claim.pValue < 0.05 && (
                            <Badge className="text-[9px] h-5 bg-green-100 text-green-800 hover:bg-green-100">
                              显著
                            </Badge>
                          )}
                        </div>

                        {editingId === claim.id ? (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">陈述文本</Label>
                              <Textarea
                                value={draftText}
                                onChange={(e) => setDraftText(e.target.value)}
                                className="text-xs min-h-[72px]"
                              />
                            </div>
                            <div className="space-y-1 max-w-[120px]">
                              <Label className="text-[10px]">容差</Label>
                              <Input
                                value={draftTolerance}
                                onChange={(e) => setDraftTolerance(e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => saveEdit(claim.id)}>
                                <Check className="h-3 w-3" /> 保存
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={cancelEdit}>
                                <X className="h-3 w-3" /> 取消
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
                                className="h-6 text-[10px] text-destructive hover:text-destructive"
                                disabled={isSaving}
                                onClick={async () => {
                                  try {
                                    await removeClaim(claim.id);
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">扩写注入预览</CardTitle>
          <CardDescription className="text-xs">
            Writer 阶段将看到的 dataClaims 摘要（只读）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-[10px] whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-md p-3 max-h-[180px] overflow-auto font-sans">
            {injectionPreview}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
