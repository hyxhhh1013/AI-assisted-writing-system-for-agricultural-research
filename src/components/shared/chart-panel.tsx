"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, BarChart3, ImageIcon, FileText, Table2 } from "lucide-react";
import { toast } from "sonner";

interface ChartPanelProps {
  projectId: string;
  onInsertToPaper: (imageUrl: string, caption: string) => void;
}

export function ChartPanel({ projectId, onInsertToPaper }: ChartPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; caption: string } | null>(null);
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [previewData, setPreviewData] = useState<{ labels: string[]; values: number[] } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setTitle(f.name.replace(/\.[^.]+$/, ""));
    setPreviewData(null);

    // 读取前几行预览数据
    try {
      const text = await f.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) return;
      const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
      const header = lines[0].split(sep).map(c => c.trim());
      const dataLines = lines.slice(1).filter(l => l.trim());
      const labels: string[] = [];
      const values: number[] = [];
      for (const line of dataLines) {
        const parts = line.split(sep).map(c => c.trim());
        if (parts.length < 2) continue;
        const val = parseFloat(parts[parts.length - 1]);
        if (isNaN(val)) continue;
        labels.push(parts[0]);
        values.push(val);
      }
      if (labels.length > 0) {
        setPreviewData({ labels, values });
      }
    } catch { /* preview is optional */ }
  };

  const handleGenerate = async () => {
    if (!file) { toast.error("请先上传数据文件"); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("dataFile", file);
      formData.append("mode", "generic");
      formData.append("config", JSON.stringify({
        title: title || "图表",
        chart_type: chartType,
        x_column: "",
        y_column: "",
      }));
      const res = await fetch("/api/chart", { method: "POST", body: formData });
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
            上传数据 → 选择图表类型 → 生成并插入论文
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          <div className="flex gap-2">
            <Button variant={chartType === "bar" ? "default" : "outline"} size="sm" className="flex-1 text-xs h-8"
              onClick={() => setChartType("bar")}>柱状图</Button>
            <Button variant={chartType === "line" ? "default" : "outline"} size="sm" className="flex-1 text-xs h-8"
              onClick={() => setChartType("line")}>折线图</Button>
            <Button variant={chartType === "scatter" ? "default" : "outline"} size="sm" className="flex-1 text-xs h-8"
              onClick={() => setChartType("scatter")}>散点图</Button>
            <Button variant={chartType === "pie" ? "default" : "outline"} size="sm" className="flex-1 text-xs h-8"
              onClick={() => setChartType("pie")}>饼图</Button>
          </div>

          <div>
            <Label className="text-xs">数据文件（CSV / XLSX）</Label>
            <Input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFile} className="text-xs h-8 mt-1" />
            {file && <p className="text-[10px] text-muted-foreground mt-1">{file.name}</p>}
          </div>

          <div>
            <Label className="text-xs">图表标题</Label>
            <Input className="h-8 text-xs mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* 数据预览 */}
          {previewData && (
            <div className="bg-muted/20 rounded p-2">
              <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-1">
                <Table2 className="h-3 w-3" />数据预览（{previewData.labels.length} 组）
              </div>
              <table className="w-full text-[10px]">
                <tbody>
                  {previewData.labels.slice(0, 10).map((label, i) => (
                    <tr key={i} className="border-b border-muted/20">
                      <td className="py-0.5 pr-2 font-mono">{label}</td>
                      <td className="py-0.5 font-mono text-right">{previewData.values[i].toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button size="sm" className="w-full text-xs" onClick={handleGenerate} disabled={loading || !file}>
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
