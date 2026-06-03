"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, Radar, FileText, Table2, Expand } from "lucide-react";
import { toast } from "sonner";
import { runPeakFit } from "@/services/xrd";
import type { PeakInfo, PeakFitData } from "@/services/xrd";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface PeakFitCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

export function PeakFitCard({ onInsertToPaper, onPreview }: PeakFitCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: PeakFitData } | null>(null);
  const [previewData, setPreviewData] = useState<{ x: number[]; y: number[] } | null>(null);
  const [dataInfo, setDataInfo] = useState("");
  const [phaseLabel, setPhaseLabel] = useState("");
  const [LFctg, setLFctg] = useState("0.5");
  const [windowLength, setWindowLength] = useState("17");
  const [prominence, setProminence] = useState("0.02");
  const [maxPeaks, setMaxPeaks] = useState("20");
  const [bgModel, setBgModel] = useState("constant");

  const parsePreview = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        setDataInfo("Excel 文件（完整解析在服务端进行）");
        setPreviewData(null);
        return;
      }
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { text = new TextDecoder("gbk").decode(bytes); }
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) return;
      const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
      const rows = lines.slice(0, 2000).map(l => l.split(sep).map(c => parseFloat(c.trim())).filter(v => !isNaN(v)));
      if (rows.length < 2) return;
      const x = rows.map(r => r[0]).filter(v => !isNaN(v));
      const y = rows.map(r => r[rows[0].length > 1 ? rows[1].length - 1 : 0]).filter(v => !isNaN(v));
      const n = Math.min(x.length, y.length);
      if (n < 5) return;
      setPreviewData({ x: x.slice(0, n), y: y.slice(0, n) });
      setDataInfo(`${n} 数据点 | ${x[0].toFixed(1)}° — ${x[n - 1].toFixed(1)}°`);
    } catch { /* preview is optional */ }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(null); setPhaseLabel(f.name.replace(/\.[^.]+$/, "")); parsePreview(f); }
  };

  const handleRun = async () => {
    if (!file) { toast.error("请先上传 XRD 数据文件"); return; }
    setLoading(true);
    try {
      const json = await runPeakFit(file, {
        title: `XRD — ${phaseLabel || file.name}`,
        phase_label: phaseLabel,
        bg_params: { LFctg: parseFloat(LFctg), window_length: parseInt(windowLength), bac_var_type: bgModel as "constant" },
        peak_params: { prominence: parseFloat(prominence), max_peaks: parseInt(maxPeaks) },
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`峰分解完成，检测到 ${json.data.n_peaks} 个峰`);
    } catch (err: unknown) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const exportCsv = (peaks: PeakInfo[]) => {
    const header = "Peak#,2theta,intensity,relative_intensity\n";
    const rows = peaks.map((p, i) => `${i + 1},${p.two_theta.toFixed(4)},${p.intensity.toFixed(2)},${p.relative_intensity.toFixed(2)}`).join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${phaseLabel || "peaks"}_peaks.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Radar className="h-4 w-4" />XRD 峰分解</CardTitle>
        <CardDescription className="text-xs">PyXplore 背景扣除 + 峰检测与标注</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">用法说明</summary>
          <p className="mt-1">上传 XRD 数据 CSV（含 2θ 和 Intensity 列），调整背景扣除参数和峰检测灵敏度，点击运行生成带峰标注的双面板图谱。支持 XLSX 格式。</p>
        </details>
        <div>
          <Label className="text-xs">XRD 数据文件 (CSV/XYD)</Label>
          <Input type="file" accept=".csv,.xyd,.txt,.xlsx" className="text-xs h-8 mt-1" onChange={handleFile} />
          {file && <p className="text-[10px] text-muted-foreground mt-1 truncate">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          {dataInfo && <p className="text-[10px] text-muted-foreground">{dataInfo}</p>}
          {previewData && previewData.x.length > 10 && (() => {
            const xs = previewData.x, ys = previewData.y;
            const xMin = xs[0], xMax = xs[xs.length - 1];
            const yMin = Math.min(...ys), yMax = Math.max(...ys);
            const yR = yMax - yMin || 1;
            const w = 240, h = 60, pad = 2;
            const pts = xs.map((x, i) => `${pad + ((x - xMin) / (xMax - xMin)) * (w - 2 * pad)},${pad + (1 - (ys[i] - yMin) / yR) * (h - 2 * pad)}`).join(" ");
            return <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto rounded-sm bg-muted/20 border"><polyline points={pts} fill="none" stroke="#3B82F6" strokeWidth="1.5" /></svg>;
          })()}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">样品名称</Label><Input value={phaseLabel} onChange={e => setPhaseLabel(e.target.value)} className="text-xs h-7 mt-0.5" placeholder="Sample A" /></div>
          <div><Label className="text-xs">背景模型</Label>
            <Select value={bgModel} onValueChange={v => v && setBgModel(v)}>
              <SelectTrigger className="text-xs h-7 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="constant">Constant</SelectItem>
                <SelectItem value="polynomial">Polynomial</SelectItem>
                <SelectItem value="multivariate gaussian">Gaussian</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">低频滤波 (LFctg)</Label><Input value={LFctg} onChange={e => setLFctg(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="0.1" min="0" max="1" /></div>
          <div><Label className="text-xs">窗口长度</Label><Input value={windowLength} onChange={e => setWindowLength(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="2" min="5" /></div>
          <div><Label className="text-xs">峰灵敏度</Label><Input value={prominence} onChange={e => setProminence(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="0.005" min="0.001" /></div>
          <div><Label className="text-xs">最大峰数</Label><Input value={maxPeaks} onChange={e => setMaxPeaks(e.target.value)} className="text-xs h-7 mt-0.5" type="number" min="1" max="100" /></div>
        </div>
        <Button className="w-full h-8 text-xs" onClick={handleRun} disabled={loading || !file}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 分析中...</> : <><Radar className="h-3.5 w-3.5 mr-1" /> 运行峰分解</>}
        </Button>
        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-muted/30 group cursor-pointer"
              onClick={() => onPreview({ src: result.imageBase64, caption: `XRD — ${phaseLabel}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="XRD" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            {result.data.peaks.length > 0 && (
              <div className="max-h-28 overflow-y-auto">
                <div className="flex items-center gap-1 text-xs font-medium mb-1 text-muted-foreground"><Table2 className="h-3 w-3" />检测到的衍射峰</div>
                <table className="w-full text-[10px] border-collapse">
                  <thead><tr className="border-b text-muted-foreground"><th className="text-left py-0.5 pr-2">#</th><th className="text-left py-0.5 pr-2">2θ (°)</th><th className="text-left py-0.5 pr-2">Intensity</th><th className="text-left py-0.5">Rel. Int. (%)</th></tr></thead>
                  <tbody>{result.data.peaks.map((peak, i) => (
                    <tr key={i} className="border-b border-muted/30">
                      <td className="py-0.5 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-0.5 pr-2 font-mono font-medium">{peak.two_theta.toFixed(2)}</td>
                      <td className="py-0.5 pr-2 font-mono">{peak.intensity.toFixed(1)}</td>
                      <td className="py-0.5 font-mono">{peak.relative_intensity.toFixed(1)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              {result.data.peaks.length > 0 && (
                <Button variant="secondary" size="sm" className="flex-1 h-7 text-xs" onClick={() => exportCsv(result.data.peaks)}>
                  <Table2 className="h-3 w-3 mr-1" /> 导出 CSV
                </Button>
              )}
              <Button variant="default" size="sm" className="flex-1 h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, `XRD 图谱 — ${phaseLabel || "unnamed"}（${result.data.n_peaks} 峰）`)}>
                <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
