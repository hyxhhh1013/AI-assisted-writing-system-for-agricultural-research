"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileSpreadsheet, Send, Copy, Table as TableIcon, BarChart3, Save, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import { streamDataAnalysis } from "@/services/analysis";
import { getErrorMessage } from "@/lib/error-utils";
import { AiResultDisclaimer } from "@/components/shared/ai-result-disclaimer";

interface AnalysisPanelProps {
  projectId: string;
  project: ProjectData;
  onSave?: (updates: Partial<ProjectData>) => void;
  onInsertToPaper?: (imageUrl: string, caption: string) => void;
  onInsertClaim?: (claimText: string, claimId: string) => void;
}

export function AnalysisPanel({ projectId, project, onSave, onInsertToPaper, onInsertClaim }: AnalysisPanelProps) {
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [dataSummary, setDataSummary] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [fileName, setFileName] = useState("");
  const [rawFile, setRawFile] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    // 同步来自项目的最新数据（仅在项目 ID 变化时）
    setResearchDirection(project.researchDirection || "");
  }, [project.id]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith(".csv")) {
      reader.onload = (event) => {
        // 用 TextDecoder 检测编码（支持 UTF-8 BOM 和 GBK）
        const buf = event.target?.result as ArrayBuffer;
        setRawFile(buf);
        const bytes = new Uint8Array(buf);
        let text: string;
        if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
          text = new TextDecoder("utf-8").decode(bytes); // UTF-8 BOM
        } else {
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            // 尝试 GBK 解码
            text = new TextDecoder("gbk").decode(bytes);
          }
        }
        import("papaparse").then(Papa => {
          Papa.default.parse(text, {
            header: true,
            complete: (results) => {
              const summary = JSON.stringify(results.data.slice(0, 15), null, 2);
              setDataSummary(summary);
              toast.success("CSV 解析成功（" + (text.includes("�") ? "GBK" : "UTF-8") + " 编码）");
            },
          });
        });
      };
      reader.readAsArrayBuffer(file);
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        setRawFile(event.target?.result as ArrayBuffer);
        import("xlsx").then(XLSX => {
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          const summary = JSON.stringify(jsonData.slice(0, 15), null, 2);
          setDataSummary(summary);
          toast.success("Excel 解析成功，已提取数据摘要");
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error("不支持的文件格式，请上传 CSV 或 Excel");
    }
  };

  const handleSaveToProject = async (customResult?: string) => {
    const finalResult = customResult ?? result;
    if (!finalResult || !projectId) return;
    
    const data = await projectStore.get(projectId);
    if (!data) return;
    
    const analysisResults = await projectStore.appendAnalysisResult(projectId, finalResult);
    const updates = { researchDirection, analysisResults };
    const updatedProject = { ...data, ...updates };
    await projectStore.save(updatedProject);
    if (onSave) onSave(updates);
    return updatedProject;
  };

  const handleGenerate = async () => {
    if (!dataSummary || !researchDirection) {
      toast.error("请先上传数据文件并填写研究方向");
      return;
    }

    setIsGenerating(true);
    setResult("");

    try {
      const fullResult = await streamDataAnalysis(
        dataSummary,
        researchDirection,
        (chunk) => setResult((prev) => prev + chunk),
      );
      
      // 生成完成后自动保存到项目
      handleSaveToProject(fullResult);
      toast.success("分析完成并已自动保存");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? getErrorMessage(error) : "分析失败");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 pb-10">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center">
              <BarChart3 className="mr-2 h-4 w-4 text-primary" /> 实验数据分析
            </CardTitle>
            <CardDescription className="text-xs">
              上传 CSV/Excel，AI 自动识别趋势并生成学术描述。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">上传实验数据</Label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex flex-col items-center justify-center pt-2 pb-2">
                    <Upload className="w-6 h-6 mb-2 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">点击上传</span> 或拖拽
                    </p>
                  </div>
                  <input type="file" className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                </label>
              </div>
              {fileName && (
                <div className="flex items-center p-2 text-[10px] bg-primary/10 text-primary rounded-md truncate">
                  <FileSpreadsheet className="mr-1 h-3 w-3 shrink-0" />
                  {fileName}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="direction" className="text-xs">研究方向与分析重点</Label>
              <Textarea
                id="direction"
                placeholder="例如：分析碳化温度对生物炭产率及孔隙结构的影响..."
                className="text-xs min-h-[80px]"
                value={researchDirection}
                onChange={(e) => setResearchDirection(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button size="sm" className="w-full text-xs" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Send className="mr-2 h-3 w-3" />}
              开始数据分析
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col min-h-[300px]">
          <CardHeader className="border-b py-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold">分析报告预览</CardTitle>
            {result && (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  handleSaveToProject();
                  toast.success("分析结果及研究方向已保存");
                }}>
                  <Save className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  navigator.clipboard.writeText(result);
                  toast.success("已复制");
                }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-4 space-y-2">
            {(result || isGenerating) && <AiResultDisclaimer compact />}
            {result ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-xs">
                {result}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic text-xs">
                <TableIcon className="h-8 w-8 mb-2 opacity-20" />
                等待数据上传与分析...
              </div>
            )}
          </CardContent>
        </Card>

        {/* 图表生成 */}
        {dataSummary && projectId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center">
                <BarChart3 className="mr-2 h-4 w-4 text-primary" /> 数据绘图
              </CardTitle>
              <CardDescription className="text-xs">
                生成分组柱状图、堆积图、折线图、三线表等。现已独立为专属页面。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={`/plot?id=${projectId}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <BarChart3 className="h-3 w-3" /> 打开数据绘图页面 →
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default AnalysisPanel;
