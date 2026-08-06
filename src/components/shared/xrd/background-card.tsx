"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { runBackgroundSubtraction } from "@/services/xrd";
import type { BackgroundData } from "@/services/xrd";
import { getErrorMessage } from "@/lib/error-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";

export function BackgroundCard({ title: toolTitle, description, onInsertToPaper }: PlotToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: BackgroundData } | null>(null);
  const [LFctg, setLFctg] = useState("0.5");
  const [windowLength, setWindowLength] = useState("17");
  const [bgModel, setBgModel] = useState("constant");
  const [sampleName, setSampleName] = useState("");

  const handleRun = async () => {
    if (!file) {
      toast.error("请先上传 XRD 数据文件");
      return;
    }
    setLoading(true);
    try {
      const json = await runBackgroundSubtraction(file, {
        title: `Background — ${sampleName || file.name}`,
        phase_label: sampleName,
        bg_params: { LFctg: parseFloat(LFctg), window_length: parseInt(windowLength), bac_var_type: bgModel as "constant" },
        peak_params: { prominence: 0.5, max_peaks: 0 },
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success("背景扣除完成");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlotWorkspace
      title={toolTitle ?? "背景扣除"}
      description={description ?? "FFT + Savitzky-Golay + Gaussian Process 背景建模"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div>
              <Label className="text-xs">XRD 数据文件 (CSV/XYD)</Label>
              <Input
                type="file"
                accept=".csv,.txt,.tsv,.xy,.xyd,.ras,.raw,.uxd,.dif,.xlsx,.xls"
                className="mt-1 h-8 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    setResult(null);
                    setSampleName(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">样品名</Label>
                <Input value={sampleName} onChange={(e) => setSampleName(e.target.value)} className="mt-0.5 h-8 text-xs" />
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
                <Label className="text-xs">低频滤波</Label>
                <Input value={LFctg} onChange={(e) => setLFctg(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="0.1" min="0" max="1" />
              </div>
              <div>
                <Label className="text-xs">窗口长度</Label>
                <Input value={windowLength} onChange={(e) => setWindowLength(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="2" min="5" />
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
          generateLabel="运行背景扣除"
          imageSrc={result?.imageBase64}
          imageAlt={`背景扣除 — ${sampleName}`}
          emptyHint="在左侧上传 XRD 数据文件。"
          footer={
            result ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                <Button size="sm" className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]" onClick={() => onInsertToPaper(result.imageUrl, `背景扣除 — ${sampleName}`)}>
                  <BarChart3 className="h-3 w-3" /> 插入论文
                </Button>
              </div>
            ) : undefined
          }
        />
      }
    />
  );
}
