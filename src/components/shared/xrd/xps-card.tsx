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
import { BarChart3, ChevronDown, ChevronUp, FileText, Layers, Plus, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { runXpsAnalysis } from "@/services/xrd";
import type { XpsConfig, XpsData } from "@/services/xrd";
import { getErrorMessage } from "@/lib/error-utils";
import {
  XPS_BG_PRESETS,
  XPS_REGION_PRESETS,
  bgParamsFromPreset,
  buildXpsQuantTableHtml,
  computeXpsQuantRows,
  type XpsBgPresetId,
} from "@/lib/xps-presets";
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

const C1S_REFERENCE_BE = 284.8;

export function XpsCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  onInsertTable,
  prefill,
}: XpsCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: XpsData } | null>(null);
  const [title, setTitle] = useState("");
  const [regionPreset, setRegionPreset] = useState("c1s");
  const [energyMin, setEnergyMin] = useState("280");
  const [energyMax, setEnergyMax] = useState("294");
  const [bgPreset, setBgPreset] = useState<XpsBgPresetId>("default");
  const [calibrateC1s, setCalibrateC1s] = useState(false);
  const [measuredC1s, setMeasuredC1s] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [iterMax, setIterMax] = useState("300");
  const [atoms, setAtoms] = useState<AtomRow[]>([
    { id: 1, element: "C", orbital: "1s1/2", energy: "284.8" },
    { id: 2, element: "C", orbital: "1s1/2", energy: "286.5" },
    { id: 3, element: "C", orbital: "1s1/2", energy: "288.5" },
  ]);
  const [nextId, setNextId] = useState(4);

  const applyRegionPreset = (presetId: string) => {
    const preset = XPS_REGION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setRegionPreset(presetId);
    setEnergyMin(preset.energyMin);
    setEnergyMax(preset.energyMax);
    setAtoms(
      preset.atoms.map((a, i) => ({
        id: i + 1,
        element: a.element,
        orbital: a.orbital,
        energy: a.energy,
      })),
    );
    setNextId(preset.atoms.length + 1);
    setResult(null);
  };

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_xps") return;
    const c = prefill.config;
    setTitle(configString(c, "title", ""));
    setEnergyMin(configString(c, "energy_min", energyMin));
    setEnergyMax(configString(c, "energy_max", energyMax));
    setIterMax(configNumberString(c, "iter_max", "300"));
    const preset = configString(c, "region_preset", "");
    if (preset) setRegionPreset(preset);
    const bg = configString(c, "bg_preset", "") as XpsBgPresetId;
    if (bg && XPS_BG_PRESETS.some((p) => p.id === bg)) setBgPreset(bg);
    setCalibrateC1s(c.calibrate_c1s === true || c.calibrate_c1s === "true");
    setMeasuredC1s(configString(c, "measured_c1s", ""));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill one-shot restore
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
      toast.error("请至少添加两个峰组分（XPS 拟合需要 ≥2）");
      return;
    }

    if (calibrateC1s && !measuredC1s.trim()) {
      toast.error("启用 C 1s 校准时请填写实测 C 1s 结合能");
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
        bg_params: bgParamsFromPreset(bgPreset),
      };

      if (energyMin && energyMax) {
        config.energy_range = [parseFloat(energyMin), parseFloat(energyMax)];
      }

      if (calibrateC1s && measuredC1s.trim()) {
        config.be_calibration = {
          reference_be: C1S_REFERENCE_BE,
          measured_be: parseFloat(measuredC1s),
        };
      }

      const json = await runXpsAnalysis(file, config);
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      const shiftNote =
        json.data.be_shift != null && Math.abs(json.data.be_shift) > 0.001
          ? `，BE 偏移 ${json.data.be_shift > 0 ? "+" : ""}${json.data.be_shift.toFixed(3)} eV`
          : "";
      toast.success(`XPS 分析完成，Rp = ${json.data.rp?.toFixed(2) ?? "N/A"}%${shiftNote}`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const buildReplayConfig = () => ({
    title,
    region_preset: regionPreset,
    energy_min: energyMin,
    energy_max: energyMax,
    bg_preset: bgPreset,
    calibrate_c1s: calibrateC1s,
    measured_c1s: measuredC1s,
    iter_max: iterMax,
    atoms: atoms
      .filter((a) => a.element && a.orbital && a.energy)
      .map((a) => ({ element: a.element, orbital: a.orbital, energy: a.energy })),
  });

  const quantRows = result ? computeXpsQuantRows(result.data.components) : [];

  return (
    <PlotWorkspace
      title={toolTitle ?? "XPS 分析"}
      description={description ?? "窄区扫描峰拟合，支持 C/N/O 模板与 C 1s 校准"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pb-5 pt-3">
            <div className="space-y-2">
              <Label className="text-xs">XPS 数据 (CSV: 结合能, 强度)</Label>
              <Input
                type="file"
                accept=".csv,.txt,.tsv,.xy,.xyd,.ras,.raw,.uxd,.dif,.xlsx,.xls"
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
              <Label className="text-xs">窄区模板</Label>
              <Select value={regionPreset} onValueChange={(v) => v && applyRegionPreset(v)}>
                <SelectTrigger className="mt-0.5 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {XPS_REGION_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">分析标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">能量范围 (起)</Label>
                <Input
                  value={energyMin}
                  onChange={(e) => setEnergyMin(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                />
              </div>
              <div>
                <Label className="text-xs">能量范围 (止)</Label>
                <Input
                  value={energyMax}
                  onChange={(e) => setEnergyMax(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">背景扣除</Label>
              <Select value={bgPreset} onValueChange={(v) => v && setBgPreset(v as XpsBgPresetId)}>
                <SelectTrigger className="mt-0.5 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {XPS_BG_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-[#1a5632]/10 bg-[#faf9f6]/80 p-3 space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#122820]">
                <input
                  type="checkbox"
                  checked={calibrateC1s}
                  onChange={(e) => setCalibrateC1s(e.target.checked)}
                  className="rounded border-gray-300"
                />
                C 1s 校准 (284.8 eV)
              </label>
              {calibrateC1s && (
                <div>
                  <Label className="text-[10px] text-[#6b7c72]">实测 C 1s 结合能 (eV)</Label>
                  <Input
                    value={measuredC1s}
                    onChange={(e) => setMeasuredC1s(e.target.value)}
                    className="mt-0.5 h-8 text-xs"
                    type="number"
                    step="0.01"
                    placeholder="如 285.2"
                  />
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#1a5632]/10 bg-[#faf9f6]/80 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-[#1a5632]" />
                <span className="text-xs font-medium text-[#122820]">峰组分</span>
                <span className="text-[10px] text-[#6b7c72]">元素 / 轨道 / BE (eV)</span>
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
                        placeholder="C"
                      />
                    </div>
                    <div className="flex-1">
                      <span className="text-[9px] text-[#6b7c72]">轨道</span>
                      <Input
                        value={atom.orbital}
                        onChange={(e) => updateAtom(atom.id, "orbital", e.target.value)}
                        className="mt-0 h-7 text-[10px]"
                        placeholder="1s1/2"
                      />
                    </div>
                    <div className="flex-[1.5]">
                      <span className="text-[9px] text-[#6b7c72]">BE (eV)</span>
                      <Input
                        value={atom.energy}
                        onChange={(e) => updateAtom(atom.id, "energy", e.target.value)}
                        className="mt-0 h-7 text-[10px]"
                        type="number"
                        placeholder="284.8"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeAtom(atom.id)}
                      disabled={atoms.length <= 2}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={addAtom}>
                  <Plus className="mr-1 h-3 w-3" /> 添加组分
                </Button>
              </div>
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
              <div>
                <Label className="text-xs">最大迭代</Label>
                <Input
                  value={iterMax}
                  onChange={(e) => setIterMax(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                  min="100"
                  step="100"
                />
              </div>
            )}
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="XPS 预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={handleRun}
          generateLabel="运行 XPS 拟合"
          readyHint="XPS 分解计算可能需要 1–5 分钟"
          emptyHint="上传数据并选择窄区模板，至少保留两个峰组分。"
          imageSrc={result?.imageBase64}
          imageAlt={`XPS — ${title}`}
          footer={
            result ? (
              <div className="space-y-3">
                {result.data.components.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-md border bg-white/80 p-2">
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
                          <th className="py-0.5 text-left">相对 %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quantRows.map((r) => (
                          <tr key={r.index} className="border-b border-[#1a5632]/10">
                            <td className="py-0.5 pr-2 text-[#6b7c72]">{r.index}</td>
                            <td className="py-0.5 pr-2 font-mono font-medium">{r.mu.toFixed(2)}</td>
                            <td className="py-0.5 pr-2 font-mono">{r.fwhm.toFixed(3)}</td>
                            <td className="py-0.5 pr-2 font-mono">{r.weight.toFixed(1)}</td>
                            <td className="py-0.5 font-mono">{r.area.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[#6b7c72]">
                      {result.data.rp != null && <span>Rp = {result.data.rp.toFixed(2)}%</span>}
                      {result.data.rwp != null && <span>Rwp = {result.data.rwp.toFixed(2)}%</span>}
                      {result.data.rsquare != null && <span>R² = {result.data.rsquare.toFixed(4)}</span>}
                      {result.data.be_shift != null && Math.abs(result.data.be_shift) > 0.001 && (
                        <span>BE 偏移 = {result.data.be_shift.toFixed(3)} eV</span>
                      )}
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
                  {onInsertTable && quantRows.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        const cap = `表 — ${title || "XPS 定量"}`;
                        const html = buildXpsQuantTableHtml(cap, quantRows);
                        const stats = [
                          result.data.rp != null ? `Rp = ${result.data.rp.toFixed(2)}%` : "",
                          result.data.be_shift != null && Math.abs(result.data.be_shift) > 0.001
                            ? `BE 校准偏移 ${result.data.be_shift.toFixed(3)} eV`
                            : "",
                        ]
                          .filter(Boolean)
                          .join("；");
                        onInsertTable(cap, html, stats);
                      }}
                    >
                      <Table2 className="mr-1 h-3 w-3" /> 插入定量表
                    </Button>
                  )}
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
                    <BarChart3 className="h-3 w-3" /> 插入谱图
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
