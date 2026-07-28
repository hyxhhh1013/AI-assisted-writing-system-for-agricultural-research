"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart3, ChevronDown, ChevronUp, FileText, Ruler, Table2 } from "lucide-react";
import { toast } from "sonner";
import { runSimulation } from "@/services/xrd";
import type { SimulateData } from "@/services/xrd";
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

interface XrdSimulateCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

export function XrdSimulateCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  prefill,
}: XrdSimulateCardProps) {
  const [cifFile, setCifFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: SimulateData } | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [wavelength, setWavelength] = useState("CuKa");
  const [angleMin, setAngleMin] = useState("10");
  const [angleMax, setAngleMax] = useState("90");
  const [angleStep, setAngleStep] = useState("0.02");
  const [grainSize, setGrainSize] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [zeroShift, setZeroShift] = useState("");
  const [thermoVib, setThermoVib] = useState("");
  const [simBg, setSimBg] = useState(false);

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_simulate") return;
    const c = prefill.config;
    setTitle(configString(c, "title", ""));
    setWavelength(configString(c, "wavelength", "CuKa"));
    setAngleMin(configNumberString(c, "angle_min", "10"));
    setAngleMax(configNumberString(c, "angle_max", "90"));
    setAngleStep(configNumberString(c, "angle_step", "0.02"));
    setGrainSize(configString(c, "grain_size", ""));
    setZeroShift(configString(c, "zero_shift", ""));
    setThermoVib(configString(c, "thermo_vib", ""));
    setSimBg(c.background === true || c.background === "true");
    setResult(null);
  }, [prefill]);

  const canGenerate = Boolean(cifFile);

  const handleRun = async () => {
    if (!cifFile) {
      toast.error("请上传 CIF 文件");
      return;
    }
    setLoading(true);
    try {
      const json = await runSimulation(cifFile, {
        title: title || "XRD Simulation",
        wavelength,
        two_theta_range: [
          parseFloat(angleMin),
          parseFloat(angleMax),
          parseFloat(angleStep),
        ] as [number, number, number],
        grain_size: grainSize ? parseFloat(grainSize) : null,
        zero_shift: zeroShift ? parseFloat(zeroShift) : null,
        thermo_vib: thermoVib ? parseFloat(thermoVib) : null,
        background: simBg,
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`模拟完成，${json.data.n_peaks} 个衍射峰`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const buildReplayConfig = () => ({
    title,
    wavelength,
    angle_min: angleMin,
    angle_max: angleMax,
    angle_step: angleStep,
    grain_size: grainSize,
    zero_shift: zeroShift,
    thermo_vib: thermoVib,
    background: simBg,
  });

  return (
    <PlotWorkspace
      title={toolTitle ?? "XRD 图谱模拟"}
      description={description ?? "从 CIF 结构文件模拟粉末衍射图谱"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pb-5 pt-3">
            <div className="space-y-2">
              <Label className="text-xs">CIF 结构文件</Label>
              <Input
                type="file"
                accept=".cif"
                className="h-8 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCifFile(f);
                    setResult(null);
                    setTitle(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">样品名称</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-0.5 h-8 text-xs"
                placeholder="Sample"
              />
            </div>
            <div>
              <Label className="text-xs">辐射波长</Label>
              <Select value={wavelength} onValueChange={(v) => v && setWavelength(v)}>
                <SelectTrigger className="mt-0.5 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CuKa">Cu Kα (1.5406 Å)</SelectItem>
                  <SelectItem value="MoKa">Mo Kα (0.7107 Å)</SelectItem>
                  <SelectItem value="CoKa">Co Kα (1.7889 Å)</SelectItem>
                  <SelectItem value="FeKa">Fe Kα (1.9360 Å)</SelectItem>
                  <SelectItem value="CrKa">Cr Kα (2.2897 Å)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">起始 2θ</Label>
                <Input
                  value={angleMin}
                  onChange={(e) => setAngleMin(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                />
              </div>
              <div>
                <Label className="text-xs">终止 2θ</Label>
                <Input
                  value={angleMax}
                  onChange={(e) => setAngleMax(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                />
              </div>
              <div>
                <Label className="text-xs">步长</Label>
                <Input
                  value={angleStep}
                  onChange={(e) => setAngleStep(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                  step="0.01"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">晶粒尺寸 (nm，可选)</Label>
              <Input
                value={grainSize}
                onChange={(e) => setGrainSize(e.target.value)}
                className="mt-0.5 h-8 text-xs"
                type="number"
                placeholder="Voigt 峰形展宽"
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-between text-xs text-[#6b7c72]"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              高级选项
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            {showAdvanced && (
              <div className="space-y-3 rounded-lg border border-[#1a5632]/10 bg-[#faf9f6]/80 p-3">
                <div>
                  <Label className="text-xs">零位漂移 (°2θ)</Label>
                  <Input
                    value={zeroShift}
                    onChange={(e) => setZeroShift(e.target.value)}
                    className="mt-0.5 h-8 text-xs"
                    type="number"
                    step="0.1"
                  />
                </div>
                <div>
                  <Label className="text-xs">热振动 (Å)</Label>
                  <Input
                    value={thermoVib}
                    onChange={(e) => setThermoVib(e.target.value)}
                    className="mt-0.5 h-8 text-xs"
                    type="number"
                    step="0.01"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={simBg}
                    onChange={(e) => setSimBg(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  模拟背景强度
                </label>
              </div>
            )}
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="模拟预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={handleRun}
          generateLabel="运行模拟"
          readyHint="CIF 已就绪，点击运行模拟"
          emptyHint="上传 CIF 结构文件后开始模拟。"
          imageSrc={result?.imageBase64}
          imageAlt={`XRD Simulation — ${title}`}
          footer={
            result ? (
              <div className="space-y-3">
                {result.data.peaks.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-white/80 p-2">
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-[#122820]">
                      <Table2 className="h-3.5 w-3.5" />
                      衍射峰 ({result.data.n_peaks})
                    </p>
                    <table className="w-full border-collapse text-[10px]">
                      <thead>
                        <tr className="border-b text-[#6b7c72]">
                          <th className="py-0.5 pr-2 text-left">#</th>
                          <th className="py-0.5 pr-2 text-left">h</th>
                          <th className="py-0.5 pr-2 text-left">k</th>
                          <th className="py-0.5 pr-2 text-left">l</th>
                          <th className="py-0.5 text-left">2θ (°)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.data.peaks.slice(0, 20).map((p, i) => (
                          <tr key={i} className="border-b border-[#1a5632]/10">
                            <td className="py-0.5 pr-2">{i + 1}</td>
                            <td className="py-0.5 pr-2 font-mono">{p.hkl?.[0] ?? "-"}</td>
                            <td className="py-0.5 pr-2 font-mono">{p.hkl?.[1] ?? "-"}</td>
                            <td className="py-0.5 pr-2 font-mono">{p.hkl?.[2] ?? "-"}</td>
                            <td className="py-0.5 font-mono font-medium">{p.two_theta.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = result.imageBase64;
                      a.download = `${title || "simulation"}.png`;
                      a.click();
                    }}
                  >
                    <FileText className="mr-1 h-3 w-3" /> 下载 PNG
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => {
                      const cap = `XRD Simulation — ${title}`;
                      onInsertToPaper(
                        result.imageUrl,
                        cap,
                        buildPlotInsertReplay("xrd_simulate", cap, buildReplayConfig()),
                      );
                    }}
                  >
                    <BarChart3 className="h-3 w-3" /> 插入论文
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        >
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <Ruler className="h-12 w-12 text-[#1a5632]/30" />
              <p className="text-sm font-medium text-[#122820]">CIF → 粉末衍射模拟</p>
              <p className="max-w-xs text-xs text-[#6b7c72]">支持 Cu/Mo/Co 等波长与 Voigt 峰形展宽。</p>
            </div>
          )}
        </PlotPreviewPane>
      }
    />
  );
}
