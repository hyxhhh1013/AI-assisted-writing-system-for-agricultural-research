"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { runBraggOptimization } from "@/services/xrd";
import type { BraggData } from "@/services/xrd";
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

interface BraggCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

export function BraggCard({ title: toolTitle, description, onInsertToPaper, prefill }: BraggCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: BraggData } | null>(null);
  const [crystalSys, setCrystalSys] = useState("1");
  const [a, setA] = useState("4.0");
  const [b, setB] = useState("4.0");
  const [c, setC] = useState("4.0");
  const [alpha, setAlpha] = useState("90");
  const [beta, setBeta] = useState("90");
  const [gamma, setGamma] = useState("90");
  const [hklInput, setHklInput] = useState("1 1 1\n2 0 0\n2 2 0\n3 1 1\n2 2 2");
  const [angleInput, setAngleInput] = useState("38.2\n44.4\n64.6\n77.6\n81.8");
  const [wavelength, setWavelength] = useState("1.54056");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_bragg") return;
    const c = prefill.config;
    setCrystalSys(configString(c, "crystal_system", "1"));
    setA(configNumberString(c, "a", "4.0"));
    setB(configNumberString(c, "b", "4.0"));
    setC(configNumberString(c, "c", "4.0"));
    setAlpha(configNumberString(c, "alpha", "90"));
    setBeta(configNumberString(c, "beta", "90"));
    setGamma(configNumberString(c, "gamma", "90"));
    setHklInput(configString(c, "hkl_input", "1 1 1\n2 0 0\n2 2 0\n3 1 1\n2 2 2"));
    setAngleInput(configString(c, "angle_input", "38.2\n44.4\n64.6\n77.6\n81.8"));
    setWavelength(configNumberString(c, "wavelength", "1.54056"));
    setTitle(configString(c, "title", ""));
    setResult(null);
  }, [prefill]);

  const canGenerate = hklInput.trim().length > 0 && angleInput.trim().length > 0;

  const handleRun = async () => {
    const hkl = hklInput.trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter((arr) => arr.length === 3) as [number, number, number][];
    const angles = angleInput.trim().split("\n").map((l) => parseFloat(l.trim())).filter((v) => !isNaN(v));
    if (hkl.length === 0 || angles.length === 0) {
      toast.error("请填写 HKL 指数和衍射角");
      return;
    }
    if (hkl.length !== angles.length) {
      toast.error("HKL 行数与衍射角数不一致");
      return;
    }
    setLoading(true);
    try {
      const json = await runBraggOptimization({
        crystal_system: parseInt(crystalSys),
        lattice_init: [parseFloat(a), parseFloat(b), parseFloat(c), parseFloat(alpha), parseFloat(beta), parseFloat(gamma)],
        hkl,
        exp_angles: angles,
        wavelength: parseFloat(wavelength),
        title: title || "Bragg Optimization",
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`优化完成! RMS 误差: ${json.data.rms_opt}° (改善 ${json.data.improvement_pct}%)`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const buildReplayConfig = () => ({
    crystal_system: crystalSys,
    a,
    b,
    c,
    alpha,
    beta,
    gamma,
    hkl_input: hklInput,
    angle_input: angleInput,
    wavelength,
    title,
  });

  return (
    <PlotWorkspace
      title={toolTitle ?? "Bragg 方程计算器"}
      description={description ?? "梯度下降法优化晶格常数"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">晶系</Label>
                <Select value={crystalSys} onValueChange={(v) => v && setCrystalSys(v)}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Cubic</SelectItem>
                    <SelectItem value="2">Hexagonal</SelectItem>
                    <SelectItem value="3">Tetragonal</SelectItem>
                    <SelectItem value="4">Orthorhombic</SelectItem>
                    <SelectItem value="5">Rhombohedral</SelectItem>
                    <SelectItem value="6">Monoclinic</SelectItem>
                    <SelectItem value="7">Triclinic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">波长 (Å)</Label>
                <Input value={wavelength} onChange={(e) => setWavelength(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.0001" />
              </div>
            </div>
            <div>
              <Label className="text-xs">初始晶格参数</Label>
              <div className="mt-0.5 grid grid-cols-6 gap-1">
                {[
                  { id: "a", v: a, s: setA },
                  { id: "b", v: b, s: setB },
                  { id: "c", v: c, s: setC },
                  { id: "α", v: alpha, s: setAlpha },
                  { id: "β", v: beta, s: setBeta },
                  { id: "γ", v: gamma, s: setGamma },
                ].map((p) => (
                  <div key={p.id}>
                    <span className="text-[9px] text-[#6b7c72]">{p.id}</span>
                    <Input value={p.v} onChange={(e) => p.s(e.target.value)} className="mt-0 h-7 text-[10px]" type="number" step="0.1" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">HKL (每行一组)</Label>
                <textarea value={hklInput} onChange={(e) => setHklInput(e.target.value)} className="mt-0.5 h-24 w-full resize-none rounded-md border bg-background px-2 py-1 font-mono text-[10px]" />
              </div>
              <div>
                <Label className="text-xs">实验 2θ (°)</Label>
                <textarea value={angleInput} onChange={(e) => setAngleInput(e.target.value)} className="mt-0.5 h-24 w-full resize-none rounded-md border bg-background px-2 py-1 font-mono text-[10px]" />
              </div>
            </div>
            <div>
              <Label className="text-xs">图标题 (可选)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" />
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="优化预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={handleRun}
          generateLabel="运行优化"
          imageSrc={result?.imageBase64}
          imageAlt={`布拉格优化 — ${title || result?.data.crystal_system}`}
          emptyHint="在左侧填写 HKL 指数与实验衍射角。"
          footer={
            result ? (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b7c72]">
                  <p>优化: a={result.data.lattice_optimized.a} b={result.data.lattice_optimized.b} c={result.data.lattice_optimized.c}</p>
                  <p>RMS: {result.data.rms_init}° → {result.data.rms_opt}° ({result.data.improvement_pct}% 改善)</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button size="sm" className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]" onClick={() => {
                    const cap = `布拉格优化 — ${result.data.crystal_system}`;
                    onInsertToPaper(
                      result.imageUrl,
                      cap,
                      buildPlotInsertReplay("xrd_bragg", cap, buildReplayConfig()),
                    );
                  }}>
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
