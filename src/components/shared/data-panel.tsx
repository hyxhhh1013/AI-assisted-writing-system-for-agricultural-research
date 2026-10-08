"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ChartConfig } from "@/contracts/data-source";
import { buildPlotPageHref, parseProjectCharts } from "@/contracts/figure";
import type { ProjectData } from "@/contracts/project";
import { getProjectWritingMode } from "@/lib/section-registry";
import { getDataPanelTitle } from "@/lib/mode-theme";
import { getModuleHref, listModules } from "@/lib/module-registry";
import { RegisteredChartsCard } from "@/components/shared/plot/registered-charts-card";
import { useEvidence } from "@/hooks/use-evidence";
import {
  inventorySheetGrids,
  loadTabularGrids,
  sliceTableBlock,
  withoutCurveStatistics,
  type SheetGrid,
  type TableBlock,
} from "@/lib/data-block-inventory";
import { streamDataAnalysis } from "@/services/analysis";
import { analyzeData } from "@/services/data-analysis";
import { getProject } from "@/services/project";
import { projectStore } from "@/lib/store";
import { withStoredPreview } from "@/lib/data-table-snapshot";
import { TabPanelShell } from "@/components/shared/tab-panel-shell";
import { AiResultDisclaimer } from "@/components/shared/ai-result-disclaimer";
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

function summarizeBlocks(blocks: TableBlock[], selected: Set<number>): string {
  const picked = blocks.filter((_, i) => selected.has(i));
  return JSON.stringify(
    picked.map((block) => ({
      label: block.label,
      sheet: block.sheetName,
      headers: block.headers,
      preview: block.preview,
    })),
    null,
    2,
  );
}

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
  onOpenProjectSettings,
}: DataPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileDragOver, setFileDragOver] = useState(false);
  const [dataSummary, setDataSummary] = useState("");
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [narrativeResult, setNarrativeResult] = useState("");
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetGrid[]>([]);
  const [blocks, setBlocks] = useState<TableBlock[]>([]);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<number>>(new Set());

  const evidence = useEvidence({
    projectId,
    project,
    onSaved: onSave,
  });

  useEffect(() => {
    setResearchDirection(project.researchDirection || "");
  }, [project.id, project.researchDirection]);

  const writingMode = getProjectWritingMode(project.mode);
  const projectCharts = parseProjectCharts(project.charts);
  const plotModule = listModules({ placement: "workbench-sidebar" }).find((m) => m.id === "plot");
  const plotHref = plotModule
    ? getModuleHref(plotModule, projectId)
    : buildPlotPageHref({ projectId });

  const handleChartInserted = async (payload: { projectId: string; sectionKey: string }) => {
    if (payload.projectId !== projectId) return;
    const fresh = await getProject(projectId);
    if (fresh) onSave?.({ sections: fresh.sections });
  };

  if (project.mode !== "research") {
    return (
      <TabPanelShell title={getDataPanelTitle(writingMode)} icon={BarChart3}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              科学绘图
            </CardTitle>
            <CardDescription className="text-xs">
              综述写作常用流程图、示意图等，无需上传实验数据；作图后插入章节即可在此查看资产。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="sm"
              className="w-full text-xs"
              onClick={() => window.open(plotHref, "_blank", "noopener,noreferrer")}
            >
              <BarChart3 className="mr-2 h-3 w-3" />
              打开科学绘图页
            </Button>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              若需 CSV 分析、数据证据与推荐图表，请在项目设置中切换为「研究论文」模式。
            </p>
            {onOpenProjectSettings && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5"
                onClick={onOpenProjectSettings}
              >
                <Settings2 className="h-3.5 w-3.5" />
                打开项目设置
              </Button>
            )}
          </CardContent>
        </Card>

        <RegisteredChartsCard
          projectId={projectId}
          charts={projectCharts}
          showWhenEmpty
          onInserted={handleChartInserted}
        />
      </TabPanelShell>
    );
  }

  const loadSpreadsheet = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!/\.(csv|xlsx|xls|tsv)$/.test(name)) {
      toast.error("这里请拖入 CSV 或 Excel。已有图请拖到写作助手。");
      return;
    }
    try {
      const grids = await loadTabularGrids(await file.arrayBuffer(), file.name);
      const found = inventorySheetGrids(grids, file.name);
      setSheets(grids);
      setBlocks(found);
      setSelectedBlocks(new Set(found.map((_, i) => i)));
      setFileName(file.name);
      setPendingFile(file);
      setDataSummary(summarizeBlocks(found, new Set(found.map((_, i) => i))));
      if (found.length === 0) {
        toast.error("没有识别到可入库的数据表，请检查表头和至少一行数据");
      } else {
        toast.success(`识别到 ${found.length} 块数据。请勾选要对上的块，再提取。`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文件解析失败");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await loadSpreadsheet(file);
  };

  const onSpreadsheetDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void loadSpreadsheet(file);
  };

  const handleExtractEvidence = async () => {
    if (!pendingFile) {
      fileInputRef.current?.click();
      return;
    }
    const picked = blocks.filter((_, i) => selectedBlocks.has(i));
    if (picked.length === 0) {
      toast.error("请至少勾选一块数据。不对的块不要入库。");
      return;
    }
    try {
      const results = picked.flatMap((block) => {
        const sheet = sheets.find((s) => s.sheetName === block.locator.sheetName) ?? sheets[0];
        if (!sheet) return [];
        const { headers, rows } = sliceTableBlock(sheet.grid, block.locator);
        if (headers.length === 0 || rows.length === 0) return [];
        const analyzed = withoutCurveStatistics(
          analyzeData(headers, rows, block.sourceFileName),
          headers,
          rows,
          block.label,
        );
        return [{
          ...analyzed,
          analysis: withStoredPreview(analyzed.analysis, headers, rows, { sheetName: block.sheetName }),
        }];
      });
      if (results.length === 0) {
        toast.error("勾选的块没有有效数据行");
        return;
      }
      await evidence.saveAnalyzedBatch(results);
      toast.success(`已按勾选提取 ${results.length} 块数据`);
    } catch {
      toast.error("证据提取失败");
    }
  };

  const toggleBlock = (index: number, checked: boolean) => {
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      setDataSummary(summarizeBlocks(blocks, next));
      return next;
    });
  };

  const saveNarrativeToProject = async (text: string) => {
    const data = await projectStore.get(projectId);
    if (!data) return;
    const analysisResults = await projectStore.appendAnalysisResult(projectId, text);
    const updates = { researchDirection, analysisResults };
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
    <TabPanelShell title={getDataPanelTitle(writingMode)} icon={Database}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              实验数据
            </CardTitle>
            <CardDescription className="text-xs">
              一个文件里的多个工作表、空行隔开的多张表会分开列出。勾选并核对含义后再提取，未勾选的不入库。
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
              className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                fileDragOver ? "border-primary bg-primary/10" : "bg-muted/50 hover:bg-muted"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFileDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                setFileDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFileDragOver(false);
              }}
              onDrop={onSpreadsheetDrop}
            >
              <Upload className="w-5 h-5 mb-1 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">点击或拖入 CSV / Excel</p>
            </button>
            {fileName && (
              <div className="flex items-center p-2 text-[10px] bg-primary/10 text-primary rounded-md truncate">
                <FileSpreadsheet className="mr-1 h-3 w-3 shrink-0" />
                {fileName}
              </div>
            )}
            {blocks.length > 0 && (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {blocks.map((block, index) => (
                  <li key={block.id} className="rounded-md border px-2 py-1.5">
                    <label className="flex items-start gap-2 text-[11px]">
                      <Checkbox
                        className="mt-0.5"
                        checked={selectedBlocks.has(index)}
                        onCheckedChange={(value) => toggleBlock(index, value === true)}
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{block.label}</span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {block.sheetName} · {block.rowCount} 行 · {block.headers.filter(Boolean).slice(0, 4).join(" / ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
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
                disabled={!pendingFile || selectedBlocks.size === 0 || evidence.isAnalyzing || evidence.isSaving}
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
            <CardContent className="p-3 space-y-2">
              <AiResultDisclaimer compact />
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">已入库的数据</CardTitle>
            <CardDescription className="text-xs">
              {evidence.sources.length > 0
                ? `已有 ${evidence.sources.length} 块。在写作助手顶栏点「数据」，逐条打开看原表。这一页不再展开摘要和证据。`
                : "确认入库之后，在写作助手顶栏点「数据」逐条查看。"}
            </CardDescription>
          </CardHeader>
        </Card>

        <RegisteredChartsCard
          projectId={projectId}
          charts={parseProjectCharts(project.charts)}
          onInserted={handleChartInserted}
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
                href={buildPlotPageHref({ projectId })}
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
