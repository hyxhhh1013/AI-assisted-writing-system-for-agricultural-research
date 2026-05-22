"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileSpreadsheet, Send, Copy, Table as TableIcon, BarChart3, Save, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import type { EvidenceClaim, ChartConfig } from "@/contracts/data-source";

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
  const [claims, setClaims] = useState<EvidenceClaim[]>([]);
  const [chartConfigs, setChartConfigs] = useState<ChartConfig[]>([]);
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

        {/* 数据证据提取 */}
        {fileName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center">
                <BarChart3 className="mr-2 h-4 w-4 text-primary" /> 数据证据提取
              </CardTitle>
              <CardDescription className="text-xs">
                自动识别数据结构，生成可引用的证据声明和图表
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button size="sm" variant="outline" className="w-full text-xs"
                onClick={async () => {
                  try {
                    let d: { claims?: unknown[]; chartConfigs?: unknown[]; analysis?: unknown };
                    if (rawFile) {
                      const fd = new FormData();
                      fd.append("file", new Blob([rawFile]), fileName);
                      const res = await fetch("/api/data/analyze", { method: "POST", body: fd });
                      d = await res.json();
                    } else {
                      const res = await fetch("/api/data/analyze", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ data: dataSummary, fileName }),
                      });
                      d = await res.json();
                    }
                    if (d.claims) {
                      setClaims(d.claims as EvidenceClaim[]);
                      if (d.chartConfigs) setChartConfigs(d.chartConfigs as ChartConfig[]);
                      // 持久化到 project
                      if (onSave && projectId) {
                        onSave({
                          dataClaims: JSON.stringify(d.claims),
                          dataSources: JSON.stringify(d.analysis || { fileName, rowCount: 0, columns: [], stats: [], generatedAt: Date.now() }),
                        });
                      }
                      toast.success(`提取 ${d.claims.length} 条证据${d.chartConfigs?.length ? `、${d.chartConfigs.length} 个推荐图表` : ""}，已保存`);
                    }
                  } catch { toast.error("证据提取失败"); }
                }}
              >提取数据证据</Button>

              {claims.length > 0 && (
                <div className="space-y-3 max-h-[350px] overflow-y-auto">
                  {/* 按证据类型分组 */}
                  {(["comparison", "mean", "trend", "correlation"] as const).map(type => {
                    const typeClaims = claims.filter(c => c.type === type);
                    if (typeClaims.length === 0) return null;
                    const typeLabel = { comparison: "组间比较", mean: "均值统计", trend: "趋势分析", correlation: "相关性" }[type];
                    const typeIcon = { comparison: "📊", mean: "📈", trend: "📉", correlation: "🔗" }[type];
                    return (
                      <div key={type} className="border rounded-md overflow-hidden">
                        <div className="bg-muted/40 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                          <span>{typeIcon}</span> {typeLabel}
                          <span className="text-[9px] font-normal ml-auto">{typeClaims.length} 条</span>
                        </div>
                        <div className="divide-y">
                          {typeClaims.map((c, i) => (
                            <div key={i} className="flex items-start justify-between gap-2 p-2.5 hover:bg-muted/20 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{c.id}</span>
                                  {c.pValue !== undefined && c.pValue < 0.05 && (
                                    <span className="text-[9px] text-green-700 bg-green-100 px-1 rounded">显著</span>
                                  )}
                                </div>
                                <p className="text-[11px] leading-relaxed">{c.text}</p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                                  onClick={() => {
                                    const md = `${c.text} [${c.id}]`;
                                    onInsertClaim?.(md, c.id);
                                    toast.success(`已插入 ${c.id}`);
                                  }}
                                >插入</Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                                  onClick={() => {
                                    navigator.clipboard.writeText(`[${c.id}] ${c.text}`);
                                    toast.success("已复制");
                                  }}
                                >复制</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 推荐图表 */}
              {chartConfigs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" /> 推荐图表
                  </p>
                  {chartConfigs.map((cfg, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2.5 bg-muted/20 rounded-md hover:bg-muted/40 transition-colors">
                      <span className="text-lg shrink-0">
                        {cfg.type === "bar" || cfg.type === "grouped_bar" ? "📊" :
                         cfg.type === "line" ? "📈" :
                         cfg.type === "scatter" ? "📍" : "📦"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{cfg.title}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {cfg.type === "bar" ? "柱状图" : cfg.type === "line" ? "折线图" : cfg.type === "scatter" ? "散点图" : cfg.type}
                          {" · "}{cfg.xLabel} vs {cfg.yLabel}
                          {" · "}{cfg.labels.length} 个数据点
                        </p>
                      </div>
                      <a
                        href={`/plot?id=${projectId}`}
                        target="_blank"
                        className="text-[10px] text-primary hover:underline shrink-0"
                      >
                        打开绘图 →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
