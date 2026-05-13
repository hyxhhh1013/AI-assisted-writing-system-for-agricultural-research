"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, BarChart3, ImageIcon, FileText, Table2, ClipboardPaste, Upload } from "lucide-react";
import { toast } from "sonner";

interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  example?: string;
}

interface ChartPanelProps {
  projectId: string;
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  registryEntry?: RegistryEntry;
}

// 注册表 ID → 旧 chart_type 映射
const ID_TO_TYPE: Record<string, string> = {
  bar_grouped: "bar",
  bar_stacked: "stacked_bar",
  bar_pct_stacked: "pct_stacked",
  line: "line",
  scatter: "scatter",
  pie: "pie",
};

/** 解析粘贴的表格数据，自动检测分隔符，返回 labels + datasets */
function parseTabularData(text: string): {
  labels: string[];
  datasets: { label: string; data: number[] }[];
  columns: string[];
} | null {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return null;

  // 检测分隔符
  const firstLine = lines[0];
  let sep = ",";
  if (firstLine.includes("\t")) sep = "\t";
  else if (firstLine.includes(";")) sep = ";";
  else if (firstLine.includes("，")) sep = "，";

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
  const dataLines = lines.slice(1).filter(l => l.trim());

  const labels: string[] = [];
  const columns: number[][] = headers.slice(1).map(() => []);

  for (const line of dataLines) {
    const parts = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    labels.push(parts[0]);
    for (let ci = 1; ci < headers.length; ci++) {
      const v = parseFloat(parts[ci]);
      columns[ci - 1].push(isNaN(v) ? 0 : v);
    }
  }

  if (labels.length === 0) return null;

  const datasets = headers.slice(1).map((h, i) => ({
    label: h,
    data: columns[i],
  }));

  return { labels, datasets, columns: headers };
}

export function ChartPanel({ projectId, onInsertToPaper, registryEntry }: ChartPanelProps) {
  const resolvedType = registryEntry ? (ID_TO_TYPE[registryEntry.id] || "bar") : "bar";
  const [inputMode, setInputMode] = useState<"file" | "paste">("paste");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState(registryEntry?.example || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; caption: string } | null>(null);
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState(resolvedType);
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");

  const parsedData = useMemo(() => {
    if (inputMode === "paste" && pasteText.trim()) {
      return parseTabularData(pasteText);
    }
    return null;
  }, [pasteText, inputMode]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      let body: FormData | null = null;
      let jsonBody: any = null;
      let endpoint = "/api/chart";
      let reqInit: RequestInit;

      if (inputMode === "file" && file) {
        body = new FormData();
        body.append("dataFile", file);
        body.append("mode", "generic");
        body.append("config", JSON.stringify({
          title: title || "图表",
          chart_type: chartType,
          x_label: xLabel,
          y_label: yLabel,
        }));
        reqInit = { method: "POST", body };
      } else if (inputMode === "paste" && parsedData) {
        // 内联数据模式：直接用 Chart.js 风格 JSON
        jsonBody = {
          data: {
            labels: parsedData.labels,
            datasets: parsedData.datasets,
          },
          chart_type: chartType,
          title: title || "图表",
          x_label: xLabel || (parsedData.columns[0] || ""),
          y_label: yLabel,
        };
        body = new FormData();
        body.append("mode", "generic");
        body.append("config", JSON.stringify(jsonBody));
        // 传一个 dummy file 满足 API 要求（dataFile 字段必须存在）
        body.append("dataFile", new Blob([pasteText], { type: "text/csv" }), "data.csv");
        reqInit = { method: "POST", body };
      } else {
        toast.error("请上传文件或粘贴数据");
        setLoading(false);
        return;
      }

      const res = await fetch(endpoint, reqInit);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setResult({ imageBase64: data.imageBase64, imageUrl: data.imageUrl, caption: title || "图表" });
      toast.success("图表生成成功");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> 图表生成
          </CardTitle>
          <CardDescription className="text-[10px]">
            粘贴数据或上传文件 → 选择图表类型 → 生成并插入论文
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          {/* 图表类型 — 有 registryEntry 时显示名称和描述，无时显示下拉选择 */}
          {registryEntry ? (
            <div className="bg-muted/20 rounded p-2">
              <div className="text-xs font-medium">{registryEntry.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{registryEntry.description}</div>
            </div>
          ) : (
            <div>
              <Label className="text-xs mb-1 block">图表类型</Label>
              <Select value={chartType} onValueChange={(v) => v && setChartType(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ID_TO_TYPE).map(([id, type]) => (
                    <SelectItem key={id} value={type} className="text-xs">{id.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 输入模式 */}
          <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
            <Button
              variant={inputMode === "paste" ? "default" : "ghost"}
              size="sm" className="flex-1 h-7 text-xs"
              onClick={() => setInputMode("paste")}
            >
              <ClipboardPaste className="h-3 w-3 mr-1" />粘贴数据
            </Button>
            <Button
              variant={inputMode === "file" ? "default" : "ghost"}
              size="sm" className="flex-1 h-7 text-xs"
              onClick={() => setInputMode("file")}
            >
              <Upload className="h-3 w-3 mr-1" />上传文件
            </Button>
          </div>

          {/* 粘贴模式 */}
          {inputMode === "paste" && (
            <div>
              <Label className="text-xs">数据（CSV / TSV 格式，第一行为列名）</Label>
              <Textarea
                className="text-xs mt-1 font-mono h-32"
                placeholder={`温度,N₂产率,CO₂产率\n500,44,44\n600,35,32\n700,30,30`}
                value={pasteText}
                onChange={e => {
                  setPasteText(e.target.value);
                  if (!title) setTitle("图表");
                }}
              />
            </div>
          )}

          {/* 文件模式 */}
          {inputMode === "file" && (
            <div>
              <Label className="text-xs">数据文件（CSV / XLSX / TXT）</Label>
              <Input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFile} className="text-xs h-8 mt-1" />
              {file && <p className="text-[10px] text-muted-foreground mt-1">{file.name}</p>}
            </div>
          )}

          {/* 数据预览 */}
          {parsedData && (
            <div className="bg-muted/20 rounded p-2">
              <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-1">
                <Table2 className="h-3 w-3" />
                数据预览 — {parsedData.labels.length} 行 × {parsedData.columns.length} 列
                {parsedData.datasets.length > 1 && `（${parsedData.datasets.length} 组数据）`}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-muted/30">
                      {parsedData.columns.map((c, i) => (
                        <th key={i} className="py-0.5 px-1 text-left font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.labels.slice(0, 10).map((label, ri) => (
                      <tr key={ri} className="border-b border-muted/20">
                        <td className="py-0.5 px-1 font-mono">{label}</td>
                        {parsedData.datasets.map((ds, di) => (
                          <td key={di} className="py-0.5 px-1 font-mono text-right">{ds.data[ri]?.toFixed(2) ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">图表标题</Label>
              <Input className="h-7 text-xs mt-0.5" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px]">X 轴标签</Label>
              <Input className="h-7 text-xs mt-0.5" value={xLabel} onChange={e => setXLabel(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px]">Y 轴标签</Label>
              <Input className="h-7 text-xs mt-0.5" value={yLabel} onChange={e => setYLabel(e.target.value)} />
            </div>
          </div>

          <Button size="sm" className="w-full text-xs" onClick={handleGenerate} disabled={loading || (inputMode === "file" && !file) || (inputMode === "paste" && !parsedData)}>
            {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ImageIcon className="mr-2 h-3 w-3" />}
            {loading ? "生成中..." : "生成图表"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> 图表预览
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.imageBase64} alt={result.caption} className="w-full rounded-lg border bg-white"
              style={{ maxHeight: 400, objectFit: "contain" }} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs gap-1 flex-1"
                onClick={() => { const a = document.createElement("a"); a.download = `${title || "chart"}.png`; a.href = result.imageBase64; a.click(); }}>
                <FileText className="h-3 w-3" /> 下载图片
              </Button>
              <Button size="sm" className="text-xs gap-1 flex-1" onClick={() => onInsertToPaper(result.imageUrl, result.caption)}>
                <BarChart3 className="h-3 w-3" /> 插入到论文
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
