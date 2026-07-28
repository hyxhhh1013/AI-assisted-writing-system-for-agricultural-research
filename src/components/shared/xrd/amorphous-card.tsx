"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { runAmorphousAnalysis } from "@/services/xrd";
import type { AmorphousData } from "@/services/xrd";
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

interface AmorphousCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

export function AmorphousCard({ title: toolTitle, description, onInsertToPaper, prefill }: AmorphousCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: AmorphousData } | null>(null);
  const [numComponents, setNumComponents] = useState("2");
  const [maxIter, setMaxIter] = useState("500");
  const [sigmaCoef, setSigmaCoef] = useState("5");
  const [sampleName, setSampleName] = useState("");

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_amorphous") return;
    const c = prefill.config;
    setSampleName(configString(c, "sample_name", ""));
    setNumComponents(configNumberString(c, "num_components", "2"));
    setMaxIter(configNumberString(c, "max_iter", "500"));
    setSigmaCoef(configNumberString(c, "sigma_coef", "5"));
    setResult(null);
  }, [prefill]);

  const handleRun = async () => {
    if (!file) {
      toast.error("请上传 XRD 数据文件");
      return;
    }
    setLoading(true);
    try {
      const json = await runAmorphousAnalysis(file, {
        title: `Amorphous — ${sampleName}`,
        mix_component: parseInt(numComponents),
        sigma2_coef: parseFloat(sigmaCoef),
        max_iter: parseInt(maxIter),
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`非晶态分析完成，Rp = ${json.data.rp_factor?.toFixed(2) || "N/A"}`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const buildReplayConfig = () => ({
    sample_name: sampleName,
    num_components: numComponents,
    max_iter: maxIter,
    sigma_coef: sigmaCoef,
  });

  return (
    <PlotWorkspace
      title={toolTitle ?? "XRD 非晶分析"}
      description={description ?? "高斯混合模型拟合非晶态组分"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div>
              <Label className="text-xs">XRD 数据文件</Label>
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
                <Label className="text-xs">组分数量</Label>
                <Input value={numComponents} onChange={(e) => setNumComponents(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" min="1" max="8" />
              </div>
              <div>
                <Label className="text-xs">σ² 系数</Label>
                <Input value={sigmaCoef} onChange={(e) => setSigmaCoef(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="1" min="1" />
              </div>
              <div>
                <Label className="text-xs">最大迭代</Label>
                <Input value={maxIter} onChange={(e) => setMaxIter(e.target.value)} className="mt-0.5 h-8 text-xs" type="number" step="500" min="100" />
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
          generateLabel="运行非晶态分析"
          imageSrc={result?.imageBase64}
          imageAlt={`非晶态分析 — ${sampleName}`}
          emptyHint="在左侧上传 XRD 数据文件。"
          footer={
            result ? (
              <div className="space-y-2">
                {result.data.components?.length > 0 && (
                  <div className="max-h-20 overflow-y-auto text-[10px] text-[#6b7c72]">
                    <p className="mb-0.5 font-medium">拟合组分:</p>
                    {result.data.components.map((c, i) => (
                      <p key={i}>#{i + 1}: μ={c.mu_2theta.toFixed(2)}° w={c.weight.toFixed(1)} σ²={c.sigma2.toFixed(2)}</p>
                    ))}
                    {result.data.rp_factor != null && <p>Rp = {result.data.rp_factor.toFixed(2)}%</p>}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button size="sm" className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]" onClick={() => {
                    const cap = `非晶态分析 — ${sampleName}`;
                    onInsertToPaper(
                      result.imageUrl,
                      cap,
                      buildPlotInsertReplay("xrd_amorphous", cap, buildReplayConfig()),
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
