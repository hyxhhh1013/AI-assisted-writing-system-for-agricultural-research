"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileSpreadsheet, Send, Copy, Table as TableIcon, BarChart3, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import { streamDataAnalysis } from "@/services/analysis";

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">正在加载...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}

function AnalysisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  const [project, setProject] = useState<ProjectData | null>(null);
  const [researchDirection, setResearchDirection] = useState("");
  const [dataSummary, setDataSummary] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    const init = async () => {
      if (!projectId) {
        const currentId = projectStore.getCurrentId();
        if (currentId) {
          router.replace(`/analysis?id=${currentId}`);
        } else {
          router.replace("/projects");
        }
        return;
      }

      const data = await projectStore.get(projectId);
      if (data) {
        setProject(data);
        if (data.researchDirection) setResearchDirection(data.researchDirection);
      }
    };
    init();
  }, [projectId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith(".csv")) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        import("papaparse").then(Papa => {
          Papa.default.parse(text, {
            header: true,
            complete: (results) => {
              // 仅提取前 10 行作为摘要，避免 Token 过大
              const summary = JSON.stringify(results.data.slice(0, 15), null, 2);
              setDataSummary(summary);
              toast.success("CSV 解析成功，已提取数据摘要");
            },
          });
        });
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
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

  const handleGenerate = async () => {
    if (!dataSummary || !researchDirection) {
      toast.error("请先上传数据文件并填写研究方向");
      return;
    }

    setIsGenerating(true);
    setResult("");

    try {
      await streamDataAnalysis(dataSummary, researchDirection, setResult);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "分析失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToProject = async () => {
    if (!result || !projectId) return;
    const data = await projectStore.get(projectId);
    if (!data) return;
    const updatedResults = [...(data.analysisResults || []), result];
    await projectStore.save({ ...data, analysisResults: updatedResults });
    toast.success("分析结果已保存到项目，可在工作台直接调用");
  };

  return (
    <>
      <PageHeader
        title="实验数据分析"
        subtitle="上传 CSV/Excel 实验数据，AI 生成学术描述并保存到项目"
        icon={BarChart3}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="mr-2 h-5 w-5 text-primary" /> 实验数据分析
            </CardTitle>
            <CardDescription>
              上传您的实验原始数据（CSV/Excel），AI 将自动识别指标变化趋势并生成学术描述。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>上传实验数据</Label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-3 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold">点击上传</span> 或拖拽文件至此
                    </p>
                    <p className="text-xs text-muted-foreground">支持 .xlsx, .xls, .csv</p>
                  </div>
                  <input type="file" className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                </label>
              </div>
              {fileName && (
                <div className="flex items-center p-2 mt-2 text-sm bg-primary/10 text-primary rounded-md">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {fileName}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="direction">研究方向与分析重点</Label>
              <Textarea
                id="direction"
                placeholder="例如：分析碳化温度对生物炭产率及孔隙结构的影响..."
                value={researchDirection}
                onChange={(e) => setResearchDirection(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              开始数据分析
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col h-full min-h-[500px]">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-lg flex items-center justify-between">
              分析报告预览
              {result && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleSaveToProject}>
                    <Save className="h-4 w-4 mr-2" /> 保存到项目
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    navigator.clipboard.writeText(result);
                    toast.success("已复制");
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-6">
            {result ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                {result}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic">
                <TableIcon className="h-12 w-12 mb-4 opacity-20" />
                等待数据上传与分析...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
