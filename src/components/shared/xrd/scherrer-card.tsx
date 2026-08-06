"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { runScherrer } from "@/services/xrd";
import type { ScherrerData } from "@/services/xrd";
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

interface ScherrerCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

const DEFAULT_PEAKS = "(111), 28.4, 0.25\n(220), 47.3, 0.32\n(311), 56.1, 0.28";

export function ScherrerCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  prefill,
}: ScherrerCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: ScherrerData } | null>(null);
  const [peakText, setPeakText] = useState(DEFAULT_PEAKS);
  const [wavelength, setWavelength] = useState("1.5406");
  const [shapeFactor, setShapeFactor] = useState("0.9");
  const [fwhmUnit, setFwhmUnit] = useState<"degree" | "radian">("degree");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_scherrer") return;
    const c = prefill.config;
    setPeakText(configString(c, "peak_text", DEFAULT_PEAKS));
    setWavelength(configNumberString(c, "wavelength", "1.5406"));
    setShapeFactor(configNumberString(c, "shape_factor", "0.9"));
    const unit = configString(c, "fwhm_unit", "degree");
    setFwhmUnit(unit === "radian" ? "radian" : "degree");
    setTitle(configString(c, "title", ""));
    setResult(null);
  }, [prefill]);

  const parsePeaks = () => {
    const peaks: { two_theta: number; fwhm: number; label?: string }[] = [];
    for (const line of peakText.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const parts = t.split(/[,，\t]+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      // label, 2theta, fwhm  或  2theta, fwhm
      if (parts.length >= 3 && Number.isNaN(parseFloat(parts[0]))) {
        const two = parseFloat(parts[1]);
        const fwhm = parseFloat(parts[2]);
        if (!Number.isNaN(two) && !Number.isNaN(fwhm)) {
          peaks.push({ label: parts[0], two_theta: two, fwhm });
        }
      } else {
        const two = parseFloat(parts[0]);
        const fwhm = parseFloat(parts[1]);
        if (!Number.isNaN(two) && !Number.isNaN(fwhm)) {
          peaks.push({
            label: parts[2] || undefined,
            two_theta: two,
            fwhm,
          });
        }
      }
    }
    return peaks;
  };

  const handleRun = async () => {
    const peaks = parsePeaks();
    if (peaks.length === 0) {
      toast.error("请填写峰位：标签, 2θ, FWHM（每行一条）");
      return;
    }
    setLoading(true);
    try {
      const json = await runScherrer({
        peaks,
        wavelength: parseFloat(wavelength) || 1.5406,
        shape_factor: parseFloat(shapeFactor) || 0.9,
        fwhm_unit: fwhmUnit,
        title: title || "Scherrer crystallite size",
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`平均晶粒尺寸 ${json.data.mean_size_nm} nm`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const buildReplayConfig = () => ({
    peak_text: peakText,
    wavelength,
    shape_factor: shapeFactor,
    fwhm_unit: fwhmUnit,
    title,
  });

  return (
    <PlotWorkspace
      title={toolTitle ?? "Scherrer 晶粒尺寸"}
      description={description ?? "D = Kλ / (β cosθ)，由峰位与半高宽估算晶粒尺寸"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">波长 λ (Å)</Label>
                <Input
                  value={wavelength}
                  onChange={(e) => setWavelength(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                  step="0.0001"
                />
              </div>
              <div>
                <Label className="text-xs">形状因子 K</Label>
                <Input
                  value={shapeFactor}
                  onChange={(e) => setShapeFactor(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                  step="0.01"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">FWHM 单位</Label>
              <Select
                value={fwhmUnit}
                onValueChange={(v) => v && setFwhmUnit(v as "degree" | "radian")}
              >
                <SelectTrigger className="mt-0.5 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="degree">度 (°)</SelectItem>
                  <SelectItem value="radian">弧度</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">峰表（标签, 2θ, FWHM）</Label>
              <textarea
                value={peakText}
                onChange={(e) => setPeakText(e.target.value)}
                className="mt-0.5 h-36 w-full resize-none rounded-md border bg-background px-2 py-1 font-mono text-[10px]"
              />
              <p className="mt-1 text-[10px] text-[#6b7c72]">
                示例：(111), 28.4, 0.25 — FWHM 通常来自峰拟合
              </p>
            </div>
            <div>
              <Label className="text-xs">图标题（可选）</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-0.5 h-8 text-xs"
              />
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="Scherrer 预览"
          loading={loading}
          canGenerate={peakText.trim().length > 0}
          onGenerate={handleRun}
          generateLabel="计算晶粒尺寸"
          imageSrc={result?.imageBase64}
          imageAlt={`Scherrer — ${title || result?.data.mean_size_nm}`}
          emptyHint="在左侧填写峰位与 FWHM。"
          footer={
            result ? (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b7c72]">
                  <p>平均尺寸：{result.data.mean_size_nm} nm（{result.data.n_peaks} 峰）</p>
                  <p>
                    λ={result.data.wavelength} Å · K={result.data.shape_factor} · FWHM=
                    {result.data.fwhm_unit}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => {
                      const cap = title || `Scherrer 晶粒尺寸 (${result.data.mean_size_nm} nm)`;
                      onInsertToPaper(
                        result.imageUrl,
                        cap,
                        buildPlotInsertReplay("xrd_scherrer", cap, buildReplayConfig()),
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
