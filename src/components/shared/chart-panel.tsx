"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Loader2,
  Upload,
  BarChart3,
  ImageIcon,
  FileText,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

type ChartMode = "generic" | "crd";

interface ChartPanelProps {
  projectId: string;
  onInsertToPaper: (imageBase64: string, caption: string) => void;
}

export function ChartPanel({ projectId, onInsertToPaper }: ChartPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ChartMode>("generic");
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imageBase64: string;
    caption: string;
  } | null>(null);
  const [columns, setColumns] = useState<string[]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setResult(null);
    setTitle(f.name.replace(/\.[^.]+$/, ""));

    // 尝试读取 CSV 列名以填充 X/Y 下拉
    if (f.name.endsWith(".csv")) {
      try {
        const text = await f.text();
        const firstLine = text.split("\n")[0];
        if (firstLine) {
          const cols = firstLine
            .split(/[,\t]/)
            .map((c) => c.trim().replace(/^"|"$/g, ""))
            .filter(Boolean);
          if (cols.length >= 2) {
            setColumns(cols);
            setXCol(cols[0]);
            setYCol(cols[1]);
          }
        }
      } catch {}
    }
  };

  const handleGenerate = async () => {
    if (!file) {
      toast.error("请先上传数据文件");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("dataFile", file);

      const config: Record<string, any> = {
        title: title || "图表",
      };

      if (mode === "generic") {
        config.chart_type = chartType || "bar";
        config.x_column = xCol;
        config.y_column = yCol;
      } else {
        config.title = title || "XRD Pattern";
        config.x_label = "2θ (degree)";
        config.y_label = "Intensity (a.u.)";
      }

      formData.append("config", JSON.stringify(config));
      formData.append("mode", mode);

      const res = await fetch("/api/chart", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "生成失败");
      }

      setResult({
        imageBase64: data.imageBase64,
        caption: title || "图表",
      });
      toast.success("图表生成成功");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (!result) return;
    // 生成 Markdown 图片标记，复制到剪贴板
    const md = `![${result.caption}](${result.imageBase64})`;
    navigator.clipboard.writeText(md).then(() => {
      toast.success("图表标记已复制，在编辑器中粘贴即可插入");
    }).catch(() => {
      toast.success("图表已生成，可右键图片复制");
    });
    onInsertToPaper(result.imageBase64, result.caption);
  };

  return (
    <div className="space-y-4">
      {/* 模式选择 */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> 图表生成
          </CardTitle>
          <CardDescription className="text-[10px]">
            上传数据 → 后端 Python 生成图表 → 插入论文
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">图表模式</Label>
            <Select
              value={mode}
              onValueChange={(v) => v && setMode(v as ChartMode)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">通用图表（柱/折线/散点/饼图）</SelectItem>
                <SelectItem value="crd">XRD / CRD 图谱</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">数据文件</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls,.txt,.xyd"
              onChange={handleFile}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">图表标题</Label>
            <Input
              className="h-8 text-xs"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {mode === "generic" && columns.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">图表类型</Label>
                <Select value={chartType} onValueChange={(v) => v && setChartType(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">柱状图</SelectItem>
                    <SelectItem value="line">折线图</SelectItem>
                    <SelectItem value="scatter">散点图</SelectItem>
                    <SelectItem value="pie">饼图</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">X 轴</Label>
                <Select value={xCol} onValueChange={(v) => v && setXCol(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Y 轴</Label>
                <Select value={yCol} onValueChange={(v) => v && setYCol(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {mode === "crd" && (
            <p className="text-[10px] text-muted-foreground">
              XRD 模式自动检测 2θ 列并绘制图谱，支持多谱线叠加和峰标注
            </p>
          )}

          <Button
            size="sm"
            className="w-full text-xs"
            onClick={handleGenerate}
            disabled={loading || !file}
          >
            {loading ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <ImageIcon className="mr-2 h-3 w-3" />
            )}
            {loading ? "生成中..." : "生成图表"}
          </Button>
        </CardContent>
      </Card>

      {/* 图表预览 */}
      {result && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> 图表预览
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageBase64}
              alt={result.caption}
              className="w-full rounded-lg border bg-white"
              style={{ maxHeight: 400, objectFit: "contain" }}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => {
                  const link = document.createElement("a");
                  link.download = `${title || "chart"}.png`;
                  link.href = result.imageBase64;
                  link.click();
                }}
              >
                <FileText className="h-3 w-3" /> 下载图片
              </Button>
              <Button
                size="sm"
                className="text-xs gap-1"
                onClick={handleInsert}
              >
                <Plus className="h-3 w-3" /> 插入到论文
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
