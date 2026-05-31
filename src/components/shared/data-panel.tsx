"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ChartConfig } from "@/contracts/data-source";
import type { ProjectData } from "@/contracts/project";
import { useEvidence } from "@/hooks/use-evidence";
import { parseDataFileToSummary } from "@/lib/parse-data-file";
import { streamDataAnalysis } from "@/services/analysis";
import { projectStore } from "@/lib/store";
import { EvidenceHubSections } from "@/components/shared/evidence-hub-sections";
import {
  BarChart3,
  Copy,
  Database,
  FileSpreadsheet,
  Loader2,
  Save,
  Send,
  Settings2,
  Table as TableIcon,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

interface DataPanelProps {
  projectId: string;
  project: ProjectData;
  onSave?: (updates: Partial<ProjectData>) => void;
  onInsertClaim?: (claimText: string, claimId: string) => void;
  onOpenProjectSettings?: () => void;
}

export function DataPanel({
  projectId,
  project,
  onSave,
  onInsertClaim,
  onOpenProjectSettings,
}: DataPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dataSummary, setDataSummary] = useState("");
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [narrativeResult, setNarrativeResult] = useState("");
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const evidence = useEvidence({
    projectId,
    project,
    onSaved: onSave,
  });

  useEffect(() => {
    setResearchDirection(project.researchDirection || "");
  }, [project.id, project.researchDirection]);

  if (project.mode !== "research") {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3">
        <Database className="h-10 w-10 text-muted-foreground/30" />
        <div className="space-y-1">
          <p className="text-sm font-medium">综述模式无需实验数据</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
            当前项目为文献驱动的综述写作。若需上传 CSV/Excel、提取数据证据，请在项目设置中切换为「研究论文」模式。
          </p>
        </div>
        {onOpenProjectSettings && (
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={onOpenProjectSettings}>
            <Settings2 className="h-3.5 w-3.5" />
            打开项目设置
          </Button>
        )}
      </div>
    );
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const parsed = await parseDataFileToSummary(file);
      setFileName(parsed.fileName);
      setDataSummary(parsed.dataSummary);
      setPendingFile(file);
      toast.success(`已加载 ${parsed.fileName}，可提取证据或生成文字描述`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文件解析失败");
    }
  };

  const handleExtractEvidence = async () => {
    if (!pendingFile) {
      fileInputRef.current?.click();
      return;
    }
    try {
      await evidence.uploadAndAnalyze(pendingFile);
      toast.success("已提取并保存结构化证据");
    } catch {
      toast.error("证据提取失败");
    }
  };

  const saveNarrativeToProject = async (text: string) => {
    const data = await projectStore.get(projectId);
    if (!data) return;
    const updates = {
      researchDirection,
      analysisResults: [...(data.analysisResults || []), text],
    };
    await projectStore.save({ ...data, ...updates });
    onSave?.(updates);
  };

  const handleGenerateNarrative = async () => {
    if (!dataSummary) {
      toast.error("请先上传数据文件");
      return;
    }
    if (!researchDirection.trim()) {
      toast.error("请填写研究方向与分析重点");
      return;
    }

    setIsGeneratingNarrative(true);
    setNarrativeResult("");
    try {
      const full = await streamDataAnalysis(dataSummary, researchDirection, setNarrativeResult);
      await saveNarrativeToProject(full);
      toast.success("趋势描述已生成并保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setIsGeneratingNarrative(false);
    }
  };

  return (
    <TabPanelShell title="实验数据" icon={Database}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              实验数据
            </CardTitle>
            <CardDescription className="text-xs">
              上传一次，分别提取可引用证据（扩写用）与 AI 趋势描述（Results 草稿）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.tsv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-5 h-5 mb-1 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">点击上传 CSV / Excel</p>
            </button>
            {fileName && (
              <div className="flex items-center p-2 text-[10px] bg-primary/10 text-primary rounded-md truncate">
                <FileSpreadsheet className="mr-1 h-3 w-3 shrink-0" />
                {fileName}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">研究方向与分析重点</Label>
              <Textarea
                placeholder="例如：分析处理对作物产量的影响..."
                className="text-xs min-h-[64px]"
                value={researchDirection}
                onChange={(e) => setResearchDirection(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                className="w-full text-xs"
                disabled={!pendingFile || evidence.isAnalyzing || evidence.isSaving}
                onClick={() => void handleExtractEvidence()}
              >
                {evidence.isAnalyzing ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <BarChart3 className="mr-2 h-3 w-3" />
                )}
                提取结构化证据
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                disabled={!dataSummary || isGeneratingNarrative}
                onClick={() => void handleGenerateNarrative()}
              >
                {isGeneratingNarrative ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-2 h-3 w-3" />
                )}
                生成 AI 趋势描述
              </Button>
            </div>

            {evidence.error && (
              <p className="text-[10px] text-destructive">{evidence.error}</p>
            )}
          </CardContent>
        </Card>

        {(narrativeResult || isGeneratingNarrative) && (
          <Card>
            <CardHeader className="border-b py-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-bold">AI 趋势描述</CardTitle>
              {narrativeResult && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      void saveNarrativeToProject(narrativeResult);
                      toast.success("已保存到项目");
                    }}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      void navigator.clipboard.writeText(narrativeResult);
                      toast.success("已复制");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-3">
              {narrativeResult ? (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-xs">
                  {narrativeResult}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  正在生成...
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!narrativeResult && !isGeneratingNarrative && !fileName && (
          <Card>
            <CardContent className="py-8 flex flex-col items-center text-muted-foreground text-xs">
              <TableIcon className="h-8 w-8 mb-2 opacity-20" />
              上传数据后可生成 Results 段落草稿
            </CardContent>
          </Card>
        )}

        <EvidenceHubSections
          claims={evidence.claims}
          summaries={evidence.summaries}
          injectionPreview={evidence.injectionPreview}
          chartConfigs={evidence.chartConfigs}
          projectId={projectId}
          isSaving={evidence.isSaving}
          onUpdateClaim={evidence.updateClaim}
          onRemoveClaim={evidence.removeClaim}
          onInsertClaim={onInsertClaim}
        />

        {fileName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                数据绘图
              </CardTitle>
              <CardDescription className="text-xs">分组柱状图、折线图、三线表等</CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
              <a
                href={`/plot?id=${projectId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                打开数据绘图页面 →
              </a>
            </CardFooter>
          </Card>
        )}
    </TabPanelShell>
  );
}

export default DataPanel;
