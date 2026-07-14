"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, FileText, Layers, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { runXpsAnalysis } from "@/services/xrd";
import type { XpsConfig, XpsData } from "@/services/xrd";
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

interface AtomRow {
  id: number;
  element: string;
  orbital: string;
  energy: string;
}

interface XpsCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function XpsCard({ title: toolTitle, description, onInsertToPaper, prefill }: XpsCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: XpsData } | null>(null);
  const [title, setTitle] = useState("");
  const [energyMin, setEnergyMin] = useState("");
  const [energyMax, setEnergyMax] = useState("");
  const [iterMax, setIterMax] = useState("300");
  const [atoms, setAtoms] = useState<AtomRow[]>([
    { id: 1, element: "N", orbital: "1s1/2", energy: "398.5" },
    { id: 2, element: "N", orbital: "1s1/2", energy: "400.0" },
  ]);
  const [nextId, setNextId] = useState(2);

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_xps") return;
    const c = prefill.config;
    setTitle(configString(c, "title", ""));
    setEnergyMin(configString(c, "energy_min", ""));
    setEnergyMax(configString(c, "energy_max", ""));
    setIterMax(configNumberString(c, "iter_max", "300"));
    const atomsRaw = c.atoms;
    if (Array.isArray(atomsRaw)) {
      const mapped: AtomRow[] = [];
      for (const item of atomsRaw) {
        if (!isRecord(item)) continue;
        mapped.push({
          id: mapped.length + 1,
          element: configString(item, "element", ""),
          orbital: configString(item, "orbital", ""),
          energy: configString(item, "energy", ""),
        });
      }
      if (mapped.length > 0) {
        setAtoms(mapped);
        setNextId(mapped.length + 1);
      }
    }
    setResult(null);
  }, [prefill]);

  const addAtom = () => {
    setAtoms([...atoms, { id: nextId, element: "", orbital: "", energy: "" }]);
    setNextId(nextId + 1);
  };

  const removeAtom = (id: number) => {
    setAtoms(atoms.filter((a) => a.id !== id));
  };

  const updateAtom = (id: number, field: keyof AtomRow, value: string) => {
    setAtoms(atoms.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const validAtomCount = atoms.filter((a) => a.element && a.orbital && a.energy).length;
  const canGenerate = Boolean(file) && validAtomCount >= 2;

  const handleRun = async () => {
    if (!file) {
      toast.error("请上传 XPS 数据文件");
      return;
    }

    const validAtoms = atoms.filter((a) => a.element && a.orbital && a.energy);
    if (validAtoms.length < 2) {
      toast.error("请至少添加两个原子标识符（XPS 峰拟合需要 ≥2 个峰）");
      return;
    }

    setLoading(true);
    try {
      const atomIdentifiers: [string, string, number][] = validAtoms.map((a) => [
        a.element,
        a.orbital,
        parseFloat(a.energy),
      ]);

      const config: XpsConfig = {
        title: title || "XPS Analysis",
        atom_identifiers: atomIdentifiers,
        iter_max: parseInt(iterMax, 10),
      };
      if (energyMin && energyMax) {
        config.energy_range = [parseFloat(energyMin), parseFloat(energyMax)];
      }

      const json = await runXpsAnalysis(file, config);
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`XPS 分析完成，R因子: ${json.data.rp?.toFixed(2) || "N/A"}`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const buildReplayConfig = () => ({
    title,
    energy_min: energyMin,
    energy_max: energyMax,
    iter_max: iterMax,
    atoms: atoms
      .filter((a) => a.element && a.orbital && a.energy)
      .map((a) => ({ element: a.element, orbital: a.orbital, energy: a.energy })),
  });

  return (
    <PlotWorkspace
      title={toolTitle ?? "XPS 分析"}
      description={description ?? "X 射线光电子能谱分解，支持价态分析、峰拟合"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pb-5 pt-3">
            <div className="space-y-2">
              <Label className="text-xs">XPS 数据 (CSV: 结合能, 强度)</Label>
              <Input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="h-8 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    setResult(null);
                    setTitle(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">分析标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">能量范围 (起)</Label>
                <Input value={energyMin} onChange={(e) => setEnergyMin(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" />
              </div>
              <div>
                <Label className="text-xs">能量范围 (止)</Label>
                <Input value={energyMax} onChange={(e) => setEnergyMax(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" />
              </div>
            </div>
            <div>
              <Label className="text-xs">最大迭代</Label>
              <Input value={iterMax} onChange={(e) => setIterMax(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" min="100" step="100" />
            </div>

            <div className="rounded-lg border border-[#1a5632]/10 bg-[#faf9f6]/80 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-[#1a5632]" />
                <span className="text-xs font-medium text-[#122820]">原子标识符</span>
                <span className="text-[10px] text-[#6b7c72]">元素 / 轨道 / 结合能 (eV)</span>
              </div>
              <div className="space-y-2">
                {atoms.map((atom) => (
                  <div key={atom.id} className="flex items-end gap-1">
                    <div className="flex-1">
                      <span className="text-[9px] text-[#6b7c72]">元素</span>
                      <Input
                        value={atom.element}
                        onChange={(e) => updateAtom(atom.id, "element", e.target.value)}
                        className="mt-0 h-7 text-[10px]"
                        placeholder="Cu"
                      />
                    </div>
                    <div className="flex-1">
                      <span className="text-[9px] text-[#6b7c72]">轨道</span>
                      <Input
                        value={atom.orbital}
                        onChange={(e) => updateAtom(atom.id, "orbital", e.target.value)}
                        className="mt-0 h-7 text-[10px]"
                        placeholder="2p3/2"
                      />
                    </div>
                    <div className="flex-[1.5]">
                      <span className="text-[9px] text-[#6b7c72]">能量 (eV)</span>
                      <Input
                        value={atom.energy}
                        onChange={(e) => updateAtom(atom.id, "energy", e.target.value)}
                        className="mt-0 h-7 text-[10px]"
                        type="number"
                        placeholder="932.6"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAtom(atom.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={addAtom}>
                  <Plus className="mr-1 h-3 w-3" /> 添加组分
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="XPS 预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={handleRun}
          generateLabel="运行 XPS 分析"
          readyHint="XPS 分解计算可能需要 1-5 分钟"
          emptyHint="上传 XPS 数据并配置至少两个原子标识符。"
          imageSrc={result?.imageBase64}
          imageAlt={`XPS — ${title}`}
          footer={
            result ? (
              <div className="space-y-3">
                {result.data.components.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-white/80 p-2">
                    <p className="mb-1 text-xs font-medium text-[#122820]">
                      峰参数 ({result.data.n_components})
                    </p>
                    <table className="w-full border-collapse text-[10px]">
                      <thead>
                        <tr className="border-b text-[#6b7c72]">
                          <th className="py-0.5 pr-2 text-left">#</th>
                          <th className="py-0.5 pr-2 text-left">BE (eV)</th>
                          <th className="py-0.5 pr-2 text-left">FWHM</th>
                          <th className="py-0.5 pr-2 text-left">Weight</th>
                          <th className="py-0.5 pr-2 text-left">Asym</th>
                          <th className="py-0.5 text-left">Area</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.data.components.map((c, i) => (
                          <tr key={i} className="border-b border-[#1a5632]/10">
                            <td className="py-0.5 pr-2 text-[#6b7c72]">{i + 1}</td>
                            <td className="py-0.5 pr-2 font-mono font-medium">{c.mu.toFixed(2)}</td>
                            <td className="py-0.5 pr-2 font-mono">{c.fwhm.toFixed(3)}</td>
                            <td className="py-0.5 pr-2 font-mono">{c.weight.toFixed(1)}</td>
                            <td className="py-0.5 pr-2 font-mono">{c.asymmetry.toFixed(3)}</td>
                            <td className="py-0.5 font-mono">{c.sigma2.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[#6b7c72]">
                      {result.data.rp != null && <span>Rp = {result.data.rp.toFixed(2)}%</span>}
                      {result.data.rwp != null && <span>Rwp = {result.data.rwp.toFixed(2)}%</span>}
                      {result.data.rsquare != null && <span>R² = {result.data.rsquare.toFixed(4)}</span>}
                      <span>迭代: {result.data.iterations}</span>
                    </div>
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
                      a.download = `${title || "xps"}.png`;
                      a.click();
                    }}
                  >
                    <FileText className="mr-1 h-3 w-3" /> 下载 PNG
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => {
                      const cap = `XPS — ${title}`;
                      onInsertToPaper(
                        result.imageUrl,
                        cap,
                        buildPlotInsertReplay("xrd_xps", cap, buildReplayConfig()),
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
