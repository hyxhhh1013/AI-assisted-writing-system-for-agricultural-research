"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Table2 } from "lucide-react";
import { toast } from "sonner";
import { runPeakFit } from "@/services/xrd";
import type { PeakInfo, PeakFitData } from "@/services/xrd";
import { getErrorMessage } from "@/lib/error-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";
import {
  buildPlotInsertReplay,
  configNumberString,
  configString,
  type PlotToolPrefill,
} from "@/contracts/figure";

interface PeakFitCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

export function PeakFitCard({ title: toolTitle, description, onInsertToPaper, prefill }: PeakFitCardProps) {
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

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_peakfit") return;
    const c = prefill.config;
    setPhaseLabel(configString(c, "phase_label", ""));
    setLFctg(configNumberString(c, "LFctg", "0.5"));
    setWindowLength(configNumberString(c, "window_length", "17"));
    setProminence(configNumberString(c, "prominence", "0.02"));
    setMaxPeaks(configNumberString(c, "max_peaks", "20"));
    setBgModel(configString(c, "bg_model", "constant"));
    setResult(null);
  }, [prefill]);

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
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        text = new TextDecoder("gbk").decode(bytes);
      }
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) return;
      const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
      const rows = lines.slice(0, 2000).map((l) => l.split(sep).map((c) => parseFloat(c.trim())).filter((v) => !isNaN(v)));
      if (rows.length < 2) return;
      const x = rows.map((r) => r[0]).filter((v) => !isNaN(v));
      const y = rows.map((r) => r[rows[0].length > 1 ? rows[1].length - 1 : 0]).filter((v) => !isNaN(v));
      const n = Math.min(x.length, y.length);
      if (n < 5) return;
      setPreviewData({ x: x.slice(0, n), y: y.slice(0, n) });
      setDataInfo(`${n} 数据点 | ${x[0].toFixed(1)}° — ${x[n - 1].toFixed(1)}°`);
    } catch {
      /* preview optional */
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setPhaseLabel(f.name.replace(/\.[^.]+$/, ""));
      parsePreview(f);
    }
  };

  const handleRun = async () => {
    if (!file) {
      toast.error("请先上传 XRD 数据文件");
      return;
    }
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
      const withFwhm = json.data.peaks.filter((p) => p.fwhm != null && p.fwhm > 0).length;
      if (withFwhm > 0) {
        toast.info(`${withFwhm} 个峰已估算 FWHM，可直接用于 Scherrer`);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = (peaks: PeakInfo[]) => {
    const hasFwhm = peaks.some((p) => p.fwhm != null && p.fwhm > 0);
    const header = hasFwhm
      ? "Peak#,2theta,intensity,relative_intensity,fwhm\n"
      : "Peak#,2theta,intensity,relative_intensity\n";
    const rows = peaks
      .map((p, i) => {
        const base = `${i + 1},${p.two_theta.toFixed(4)},${p.intensity.toFixed(2)},${p.relative_intensity.toFixed(2)}`;
        return hasFwhm ? `${base},${p.fwhm != null && p.fwhm > 0 ? p.fwhm.toFixed(4) : ""}` : base;
      })
      .join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${phaseLabel || "peaks"}_peaks.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildReplayConfig = () => ({
    phase_label: phaseLabel,
    LFctg,
    window_length: windowLength,
    prominence,
    max_peaks: maxPeaks,
    bg_model: bgModel,
  });

  return (
    <PlotWorkspace
      title={toolTitle ?? "XRD 峰拟合"}
      description={description ?? "PyXplore 背景扣除 + 峰检测与标注"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div>
              <Label className="text-xs">XRD 数据文件 (CSV/XYD)</Label>
              <Input type="file" accept=".csv,.txt,.tsv,.xy,.xyd,.ras,.raw,.uxd,.dif,.xlsx,.xls" className="mt-1 h-8 text-xs" onChange={handleFile} />
              {file && <p className="mt-1 truncate text-[10px] text-[#6b7c72]">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
              {dataInfo && <p className="text-[10px] text-[#6b7c72]">{dataInfo}</p>}
              {previewData && previewData.x.length > 10 && (() => {
                const xs = previewData.x;
                const ys = previewData.y;
                const xMin = xs[0];
                const xMax = xs[xs.length - 1];
                const yMin = Math.min(...ys);
                const yMax = Math.max(...ys);
                const yR = yMax - yMin || 1;
                const w = 240;
                const h = 60;
                const pad = 2;
                const pts = xs.map((x, i) => `${pad + ((x - xMin) / (xMax - xMin)) * (w - 2 * pad)},${pad + (1 - (ys[i] - yMin) / yR) * (h - 2 * pad)}`).join(" ");
                return <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-auto w-full rounded-sm border bg-[#faf9f6]"><polyline points={pts} fill="none" stroke="#1a5632" strokeWidth="1.5" /></svg>;
              })()}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">样品名称</Label>
                <Input value={phaseLabel} onChange={(e) => setPhaseLabel(e.target.value)} className="mt-0.5 h-8 text-xs" placeholder="Sample A" />
              </div>
              <div>
                <Label className="text-xs">背景模型</Label>
                <Select value={bgModel} onValueChange={(v) => v && setBgModel(v)}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="constant">Constant</SelectItem>
                    <SelectItem value="polynomial">Polynomial</SelectItem>
                    <SelectItem value="multivariate gaussian">Gaussian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">低频滤波 (LFctg)</Label>
                <Input value={LFctg} onChange={(e) => setLFctg(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.1" min="0" max="1" />
              </div>
              <div>
                <Label className="text-xs">窗口长度</Label>
                <Input value={windowLength} onChange={(e) => setWindowLength(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="2" min="5" />
              </div>
              <div>
                <Label className="text-xs">峰灵敏度</Label>
                <Input value={prominence} onChange={(e) => setProminence(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.005" min="0.001" />
              </div>
              <div>
                <Label className="text-xs">最大峰数</Label>
                <Input value={maxPeaks} onChange={(e) => setMaxPeaks(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" min="1" max="100" />
              </div>
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="XRD 预览"
          loading={loading}
          canGenerate={Boolean(file)}
          onGenerate={handleRun}
          generateLabel="运行峰分解"
          imageSrc={result?.imageBase64}
          imageAlt={`XRD — ${phaseLabel}`}
          emptyHint="在左侧上传 XRD 数据文件（CSV/XYD）。"
          footer={
            result ? (
              <div className="space-y-2">
                {result.data.peaks.length > 0 && (() => {
                  const showFwhm = result.data.peaks.some((p) => p.fwhm != null && p.fwhm > 0);
                  return (
                  <div className="max-h-28 overflow-y-auto rounded border border-[#1a5632]/10 bg-white p-2">
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-[#6b7c72]">
                      <Table2 className="h-3 w-3" />检测到的衍射峰
                    </p>
                    <table className="w-full border-collapse text-[10px]">
                      <thead>
                        <tr className="border-b text-[#6b7c72]">
                          <th className="py-0.5 pr-2 text-left">#</th>
                          <th className="py-0.5 pr-2 text-left">2θ (°)</th>
                          <th className="py-0.5 pr-2 text-left">Intensity</th>
                          <th className="py-0.5 pr-2 text-left">Rel. Int. (%)</th>
                          {showFwhm && <th className="py-0.5 text-left">FWHM (°)</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {result.data.peaks.map((peak, i) => (
                          <tr key={i} className="border-b border-[#1a5632]/5">
                            <td className="py-0.5 pr-2 text-[#6b7c72]">{i + 1}</td>
                            <td className="py-0.5 pr-2 font-mono font-medium">{peak.two_theta.toFixed(2)}</td>
                            <td className="py-0.5 pr-2 font-mono">{peak.intensity.toFixed(1)}</td>
                            <td className="py-0.5 pr-2 font-mono">{peak.relative_intensity.toFixed(1)}</td>
                            {showFwhm && (
                              <td className="py-0.5 font-mono">
                                {peak.fwhm != null && peak.fwhm > 0 ? peak.fwhm.toFixed(3) : "—"}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  {result.data.peaks.length > 0 && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => exportCsv(result.data.peaks)}>
                      <Table2 className="h-3 w-3" /> 导出 CSV
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => {
                      const cap = `XRD 图谱 — ${phaseLabel || "unnamed"}（${result.data.n_peaks} 峰）`;
                      onInsertToPaper(
                        result.imageUrl,
                        cap,
                        buildPlotInsertReplay("xrd_peakfit", cap, buildReplayConfig()),
                      );
                    }}
                  >
                    <BarChart3 className="h-3 w-3" /> 插入论文
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        />
      }
    />
  );
}
