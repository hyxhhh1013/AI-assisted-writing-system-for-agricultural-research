"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileSpreadsheet, Send, Copy, Table as TableIcon, BarChart3, Save, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { projectStore, ProjectData } from "@/lib/store";
import { ChartPanel } from "@/components/shared/chart-panel";

interface AnalysisPanelProps {
  projectId: string;
  project: ProjectData;
  onSave?: (updates: Partial<ProjectData>) => void;
}

export function AnalysisPanel({ projectId, project, onSave }: AnalysisPanelProps) {
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [dataSummary, setDataSummary] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [fileName, setFileName] = useState("");

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
        const text = event.target?.result as string;
        Papa.parse(text, {
          header: true,
          complete: (results) => {
            const summary = JSON.stringify(results.data.slice(0, 15), null, 2);
            setDataSummary(summary);
            toast.success("CSV 解析成功，已提取数据摘要");
          },
        });
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        const summary = JSON.stringify(jsonData.slice(0, 15), null, 2);
        setDataSummary(summary);
        toast.success("Excel 解析成功，已提取数据摘要");
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
    
    const updates = {
      researchDirection,
      analysisResults: [...(data.analysisResults || []), finalResult]
    };
    
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
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSummary, researchDirection }),
      });

      if (!response.ok) throw new Error("分析失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResult = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim().startsWith("data:")) {
              try {
                const data = JSON.parse(line.trim().slice(5).trim());
                const content = data.choices?.[0]?.delta?.content || "";
                fullResult += content;
                setResult(fullResult);
              } catch (e) {}
            }
          }
        }
      }
      
      // 生成完成后自动保存到项目
      handleSaveToProject(fullResult);
      toast.success("分析完成并已自动保存");
    } catch (error: any) {
      toast.error(error.message);
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
          <CardContent className="flex-1 overflow-auto p-4">
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
                <ImageIcon className="mr-2 h-4 w-4 text-primary" /> 数据可视化图表
              </CardTitle>
              <CardDescription className="text-xs">
                基于上传数据生成图表，可插入论文章节。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartPanel
                projectId={projectId}
                onInsertToPaper={(imageBase64, caption) => {
                  toast.success(`图表「${caption}」已生成，可手动复制到论文章节`);
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default AnalysisPanel;
