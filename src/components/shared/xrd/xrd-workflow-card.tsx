"use client";

import { useCallback, useMemo, useState } from "react";
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
import { BarChart3, ChevronRight, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";
import {
  runPeakFit,
  runPhaseSearch,
  runScherrer,
  runXrdStack,
  type PeakFitData,
  type PhaseSearchData,
  type ScherrerData,
  type XrdStackData,
} from "@/services/xrd";
import { getErrorMessage } from "@/lib/error-utils";
import {
  XRD_WORKFLOW_STEPS,
  buildScherrerResultTableHtml,
  buildPhaseMatchTableHtml,
  buildXrdPeakTableHtml,
  fileBaseName,
  parseScherrerPeakText,
  peaksToScherrerText,
  peaksHaveFwhm,
  type XrdWorkflowStep,
} from "@/lib/xrd-workflow-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";
import { buildPlotInsertReplay } from "@/contracts/figure";

type StepResult = {
  imageBase64: string;
  imageUrl: string;
};

export function XrdWorkflowCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  onInsertTable,
}: PlotToolProps) {
  const [step, setStep] = useState<XrdWorkflowStep>("import");
  const [loading, setLoading] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [labelText, setLabelText] = useState("");
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [sampleTitle, setSampleTitle] = useState("");

  const [offset, setOffset] = useState("0.15");
  const [normalize, setNormalize] = useState(true);
  const [stackResult, setStackResult] = useState<(StepResult & { data: XrdStackData }) | null>(null);

  const [phaseLabel, setPhaseLabel] = useState("");
  const [LFctg, setLFctg] = useState("0.5");
  const [prominence, setProminence] = useState("0.02");
  const [peakfitResult, setPeakfitResult] = useState<(StepResult & { data: PeakFitData }) | null>(null);
  const [phaseMatches, setPhaseMatches] = useState<PhaseSearchData | null>(null);

  const [peakText, setPeakText] = useState("");
  const [defaultFwhm, setDefaultFwhm] = useState("0.25");
  const [wavelength, setWavelength] = useState("1.5406");
  const [shapeFactor, setShapeFactor] = useState("0.9");
  const [scherrerResult, setScherrerResult] = useState<(StepResult & { data: ScherrerData }) | null>(null);

  const stepIndex = XRD_WORKFLOW_STEPS.findIndex((s) => s.id === step);
  const multiFile = files.length > 1;
  const primaryFile = files[primaryIndex] ?? files[0] ?? null;

  const handleImportFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).slice(0, 12);
    setFiles(next);
    setStackResult(null);
    setPeakfitResult(null);
    setPhaseMatches(null);
    setScherrerResult(null);
    if (!labelText.trim()) {
      setLabelText(next.map(fileBaseName).join("\n"));
    }
    if (!sampleTitle.trim() && next[0]) {
      setSampleTitle(fileBaseName(next[0]));
    }
    if (!phaseLabel.trim() && next[0]) {
      setPhaseLabel(fileBaseName(next[0]));
    }
    setPrimaryIndex(0);
  };

  const goNext = useCallback(() => {
    const order: XrdWorkflowStep[] = multiFile
      ? ["import", "stack", "peakfit", "scherrer"]
      : ["import", "peakfit", "scherrer"];
    const idx = order.indexOf(step);
    if (idx >= 0 && idx < order.length - 1) {
      const nextStep = order[idx + 1];
      if (nextStep === "scherrer" && peakfitResult?.data.peaks.length) {
        setPeakText(peaksToScherrerText(peakfitResult.data.peaks, parseFloat(defaultFwhm) || 0.25));
      }
      setStep(nextStep);
    }
  }, [multiFile, step, peakfitResult, defaultFwhm]);

  const runStack = async () => {
    if (files.length === 0) {
      toast.error("请先导入数据");
      return;
    }
    setLoading(true);
    try {
      const labels = labelText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const json = await runXrdStack(
        files,
        {
          title: sampleTitle || "XRD Patterns",
          offset: parseFloat(offset) || 0.15,
          normalize,
        },
        labels.length > 0 ? labels : undefined,
      );
      setStackResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`叠加完成 (${json.data.n_spectra} 条谱)`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const runPeakfit = async () => {
    if (!primaryFile) {
      toast.error("请先导入数据");
      return;
    }
    setLoading(true);
    try {
      const json = await runPeakFit(primaryFile, {
        title: `XRD — ${phaseLabel || fileBaseName(primaryFile)}`,
        phase_label: phaseLabel,
        bg_params: { LFctg: parseFloat(LFctg), window_length: 17, bac_var_type: "constant" },
        peak_params: { prominence: parseFloat(prominence), max_peaks: 20 },
      });
      setPeakfitResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      setPeakText(peaksToScherrerText(json.data.peaks, parseFloat(defaultFwhm) || 0.25));
      setPhaseMatches(null);
      toast.success(`检测到 ${json.data.n_peaks} 个峰`);
      const fwhmCount = json.data.peaks.filter((p) => p.fwhm != null && p.fwhm > 0).length;
      if (fwhmCount > 0) {
        toast.info(`已估算 ${fwhmCount} 个峰的 FWHM，Scherrer 步骤将自动填入`);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const runPhaseSearchStep = async () => {
    if (!peakfitResult?.data.peaks.length) {
      toast.error("请先完成峰拟合");
      return;
    }
    setLoading(true);
    try {
      const json = await runPhaseSearch({
        peaks: peakfitResult.data.peaks.map((p) => ({
          two_theta: p.two_theta,
          intensity: p.intensity,
          relative_intensity: p.relative_intensity,
        })),
        top_k: 5,
      });
      setPhaseMatches(json.data);
      if (json.data.n_matches === 0) {
        toast.info("未匹配到参考相，可调整容差或扩展参考库");
      } else {
        toast.success(`匹配到 ${json.data.n_matches} 个候选相`);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const runScherrerStep = async () => {
    const peaks = parseScherrerPeakText(peakText);
    if (peaks.length === 0) {
      toast.error("请填写峰表：标签, 2θ, FWHM");
      return;
    }
    setLoading(true);
    try {
      const json = await runScherrer({
        peaks,
        wavelength: parseFloat(wavelength) || 1.5406,
        shape_factor: parseFloat(shapeFactor) || 0.9,
        fwhm_unit: "degree",
        title: sampleTitle ? `Scherrer — ${sampleTitle}` : "Scherrer crystallite size",
      });
      setScherrerResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`平均晶粒尺寸 ${json.data.mean_size_nm} nm`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const previewState = useMemo(() => {
    if (step === "stack" && stackResult) return stackResult;
    if (step === "peakfit" && peakfitResult) return peakfitResult;
    if (step === "scherrer" && scherrerResult) return scherrerResult;
    if (stackResult) return stackResult;
    if (peakfitResult) return peakfitResult;
    if (scherrerResult) return scherrerResult;
    return null;
  }, [step, stackResult, peakfitResult, scherrerResult]);

  const handleGenerate = () => {
    if (step === "stack") void runStack();
    else if (step === "peakfit") void runPeakfit();
    else if (step === "scherrer") void runScherrerStep();
  };

  const canGenerate =
    (step === "stack" && files.length > 0) ||
    (step === "peakfit" && Boolean(primaryFile)) ||
    (step === "scherrer" && peakText.trim().length > 0);

  const generateLabel =
    step === "stack" ? "生成叠加图" : step === "peakfit" ? "运行峰拟合" : step === "scherrer" ? "计算 Scherrer" : "";

  const stepper = (
    <div className="flex flex-wrap gap-1 border-b border-[#1a5632]/10 px-3 py-2">
      {XRD_WORKFLOW_STEPS.filter((s) => s.id !== "stack" || multiFile || step === "stack").map((s, i) => {
        const active = s.id === step;
        const done = XRD_WORKFLOW_STEPS.findIndex((x) => x.id === s.id) < stepIndex;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              active
                ? "bg-[#1a5632] text-white"
                : done
                  ? "bg-[#1a5632]/12 text-[#1a5632]"
                  : "text-[#6b7c72] hover:bg-[#1a5632]/8"
            }`}
          >
            <span className="opacity-70">{i + 1}.</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );

  const importPanel = (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">XRD 数据（可多选 .xy / CSV）</Label>
        <Input
          type="file"
          accept=".csv,.txt,.tsv,.xy,.xyd,.ras,.raw,.uxd,.dif,.xlsx,.xls"
          multiple
          className="mt-0.5 h-8 text-xs"
          onChange={(e) => handleImportFiles(e.target.files)}
        />
        {files.length > 0 && (
          <p className="mt-1 text-[10px] text-[#6b7c72]">已导入 {files.length} 个文件</p>
        )}
      </div>
      {multiFile && (
        <div>
          <Label className="text-xs">图例（每行一个）</Label>
          <textarea
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            className="mt-0.5 h-20 w-full resize-none rounded-md border bg-background px-2 py-1 font-mono text-[10px]"
          />
        </div>
      )}
      <div>
        <Label className="text-xs">样品 / 图标题</Label>
        <Input
          value={sampleTitle}
          onChange={(e) => setSampleTitle(e.target.value)}
          className="mt-0.5 h-8 text-xs"
        />
      </div>
      <Button
        className="w-full bg-[#1a5632] hover:bg-[#144228]"
        size="sm"
        disabled={files.length === 0}
        onClick={goNext}
      >
        下一步
        <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const stackPanel = (
    <div className="space-y-3">
      {!multiFile && (
        <p className="rounded-md border border-dashed border-[#1a5632]/20 bg-[#faf9f6] px-2 py-2 text-[10px] text-[#6b7c72]">
          当前仅 1 条谱，可跳过叠加直接进入峰拟合。
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">偏移比例</Label>
          <Input
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
            className="mt-0.5 h-8 text-xs"
            type="number"
            step="0.05"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
            归一化
          </label>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setStep("peakfit")}>
          跳过
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
          disabled={!multiFile || loading}
          onClick={() => void runStack().then(() => goNext())}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "叠加并继续"}
        </Button>
      </div>
    </div>
  );

  const peakfitPanel = (
    <div className="space-y-3">
      {multiFile && (
        <div>
          <Label className="text-xs">峰拟合目标谱</Label>
          <Select
            value={String(primaryIndex)}
            onValueChange={(v) => v && setPrimaryIndex(parseInt(v, 10))}
          >
            <SelectTrigger className="mt-0.5 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {files.map((f, i) => (
                <SelectItem key={i} value={String(i)}>
                  {fileBaseName(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label className="text-xs">相 / 样品标签</Label>
        <Input
          value={phaseLabel}
          onChange={(e) => setPhaseLabel(e.target.value)}
          className="mt-0.5 h-8 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">LFctg</Label>
          <Input value={LFctg} onChange={(e) => setLFctg(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.1" />
        </div>
        <div>
          <Label className="text-xs">峰灵敏度</Label>
          <Input value={prominence} onChange={(e) => setProminence(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.005" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Scherrer 默认 FWHM (°)</Label>
        <Input
          value={defaultFwhm}
          onChange={(e) => setDefaultFwhm(e.target.value)}
          className="mt-0.5 h-8 text-xs"
          type="number"
          step="0.01"
        />
        <p className="mt-0.5 text-[9px] text-[#6b7c72]">
          峰拟合会估算 FWHM；此处仅作缺失时的回退值
        </p>
      </div>
      <Button
        className="w-full bg-[#1a5632] hover:bg-[#144228]"
        size="sm"
        disabled={!primaryFile || loading}
        onClick={() => void runPeakfit().then(() => setStep("scherrer"))}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "峰拟合并继续"}
      </Button>
      {peakfitResult && peakfitResult.data.peaks.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          disabled={loading}
          onClick={() => void runPhaseSearchStep()}
        >
          相检索（内置参考库）
        </Button>
      )}
      {phaseMatches && phaseMatches.matches.length > 0 && (
        <div className="rounded border bg-white/80 p-2 text-[10px]">
          <p className="mb-1 font-medium text-[#122820]">相检索 Top {phaseMatches.matches.length}</p>
          <ul className="space-y-0.5">
            {phaseMatches.matches.map((m) => (
              <li key={m.phase_id} className="flex justify-between gap-2">
                <span>{m.name} ({m.formula})</span>
                <span className="font-mono text-[#1a5632]">{(m.score * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const scherrerPanel = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">λ (Å)</Label>
          <Input value={wavelength} onChange={(e) => setWavelength(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.0001" />
        </div>
        <div>
          <Label className="text-xs">K</Label>
          <Input value={shapeFactor} onChange={(e) => setShapeFactor(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.01" />
        </div>
      </div>
      <div>
        <Label className="text-xs">峰表（标签, 2θ, FWHM）</Label>
        <textarea
          value={peakText}
          onChange={(e) => setPeakText(e.target.value)}
          className="mt-0.5 h-32 w-full resize-none rounded-md border bg-background px-2 py-1 font-mono text-[10px]"
        />
        {peakfitResult && peaksHaveFwhm(peakfitResult.data.peaks) && (
          <p className="mt-1 text-[9px] text-[#1a5632]">FWHM 来自峰拟合半高宽估算，可按图微调</p>
        )}
      </div>
      {peakfitResult && peakfitResult.data.peaks.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          onClick={() =>
            setPeakText(peaksToScherrerText(peakfitResult.data.peaks, parseFloat(defaultFwhm) || 0.25))
          }
        >
          从峰拟合结果重新填充
        </Button>
      )}
    </div>
  );

  const configBody =
    step === "import"
      ? importPanel
      : step === "stack"
        ? stackPanel
        : step === "peakfit"
          ? peakfitPanel
          : scherrerPanel;

  return (
    <PlotWorkspace
      title={toolTitle ?? "XRD 工作流"}
      description={description ?? "导入 → 叠加 → 峰拟合 → Scherrer，Jade 式主线"}
      config={
        <>
          {stepper}
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 pb-5 pt-3">{configBody}</div>
          </ScrollArea>
        </>
      }
      preview={
        <PlotPreviewPane
          paneTitle={XRD_WORKFLOW_STEPS.find((s) => s.id === step)?.label ?? "预览"}
          loading={loading}
          canGenerate={step !== "import" && canGenerate}
          onGenerate={handleGenerate}
          generateLabel={generateLabel}
          emptyHint={XRD_WORKFLOW_STEPS.find((s) => s.id === step)?.hint ?? "完成左侧步骤后在此预览。"}
          imageSrc={previewState?.imageBase64}
          imageAlt={`XRD workflow — ${sampleTitle}`}
          footer={
            previewState ? (
              <div className="space-y-3">
                {peakfitResult && step !== "import" && peakfitResult.data.peaks.length > 0 && (() => {
                  const showFwhm = peaksHaveFwhm(peakfitResult.data.peaks);
                  return (
                  <div className="max-h-28 overflow-y-auto rounded border bg-white/80 p-2 text-[10px]">
                    <p className="mb-1 font-medium text-[#122820]">峰表 ({peakfitResult.data.n_peaks})</p>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b text-[#6b7c72]">
                          <th className="py-0.5 pr-2 text-left">2θ</th>
                          <th className="py-0.5 pr-2 text-left">I</th>
                          <th className="py-0.5 pr-2 text-left">Rel.%</th>
                          {showFwhm && <th className="py-0.5 text-left">FWHM</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {peakfitResult.data.peaks.slice(0, 8).map((p, i) => (
                          <tr key={i} className="border-b border-[#1a5632]/10">
                            <td className="py-0.5 pr-2 font-mono">{p.two_theta.toFixed(2)}</td>
                            <td className="py-0.5 pr-2 font-mono">{p.intensity.toFixed(0)}</td>
                            <td className="py-0.5 pr-2 font-mono">{p.relative_intensity.toFixed(1)}</td>
                            {showFwhm && (
                              <td className="py-0.5 font-mono">
                                {p.fwhm != null && p.fwhm > 0 ? p.fwhm.toFixed(3) : "—"}
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
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">插入论文</span>

                  {stackResult && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        const cap = sampleTitle || `XRD 多谱叠加 (${stackResult.data.n_spectra})`;
                        onInsertToPaper(stackResult.imageUrl, cap, buildPlotInsertReplay("xrd_stack", cap, { title: sampleTitle, offset, normalize }));
                      }}
                    >
                      <BarChart3 className="mr-1 h-3 w-3" /> 叠加图
                    </Button>
                  )}

                  {peakfitResult && (
                    <>
                      {onInsertTable && peakfitResult.data.peaks.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            const cap = `表 — ${phaseLabel || sampleTitle} XRD 峰位`;
                            onInsertTable(
                              cap,
                              buildXrdPeakTableHtml(cap, peakfitResult.data.peaks),
                              `共 ${peakfitResult.data.n_peaks} 个衍射峰`,
                            );
                          }}
                        >
                          <Table2 className="mr-1 h-3 w-3" /> 峰表
                        </Button>
                      )}
                      {onInsertTable && phaseMatches && phaseMatches.matches.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            const cap = `表 — ${phaseLabel || sampleTitle} 相检索`;
                            onInsertTable(
                              cap,
                              buildPhaseMatchTableHtml(cap, phaseMatches.matches),
                              `Top ${phaseMatches.matches.length} 候选相`,
                            );
                          }}
                        >
                          <Table2 className="mr-1 h-3 w-3" /> 相检索表
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          const cap = `XRD — ${phaseLabel || sampleTitle}（${peakfitResult.data.n_peaks} 峰）`;
                          onInsertToPaper(
                            peakfitResult.imageUrl,
                            cap,
                            buildPlotInsertReplay("xrd_peakfit", cap, { phase_label: phaseLabel, LFctg, prominence }),
                          );
                        }}
                      >
                        <BarChart3 className="mr-1 h-3 w-3" /> 峰拟合图
                      </Button>
                    </>
                  )}

                  {scherrerResult && (
                    <>
                      {onInsertTable && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            const cap = `表 — Scherrer ${sampleTitle || phaseLabel}`;
                            onInsertTable(
                              cap,
                              buildScherrerResultTableHtml(cap, scherrerResult.data.peaks, scherrerResult.data.mean_size_nm),
                              `平均晶粒尺寸 ${scherrerResult.data.mean_size_nm} nm`,
                            );
                          }}
                        >
                          <Table2 className="mr-1 h-3 w-3" /> 尺寸表
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-8 bg-[#1a5632] text-xs hover:bg-[#144228]"
                        onClick={() => {
                          const cap = `Scherrer — ${sampleTitle || phaseLabel} (${scherrerResult.data.mean_size_nm} nm)`;
                          onInsertToPaper(
                            scherrerResult.imageUrl,
                            cap,
                            buildPlotInsertReplay("xrd_scherrer", cap, { peak_text: peakText, wavelength, shape_factor: shapeFactor }),
                          );
                        }}
                      >
                        <BarChart3 className="mr-1 h-3 w-3" /> Scherrer 图
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : undefined
          }
        />
      }
    />
  );
}
