"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, Layers, FileText, Expand } from "lucide-react";
import { toast } from "sonner";
import { runAmorphousAnalysis } from "@/services/xrd";
import type { AmorphousData } from "@/services/xrd";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface AmorphousCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

export function AmorphousCard({ onInsertToPaper, onPreview }: AmorphousCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: AmorphousData } | null>(null);
  const [numComponents, setNumComponents] = useState("2");
  const [maxIter, setMaxIter] = useState("500");
  const [sigmaCoef, setSigmaCoef] = useState("5");
  const [sampleName, setSampleName] = useState("");

  const handleRun = async () => {
    if (!file) { toast.error("请上传 XRD 数据文件"); return; }
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
    } catch (err: unknown) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" />非晶态分析</CardTitle>
        <CardDescription className="text-xs">高斯混合模型拟合非晶态组分</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">用法说明</summary>
          <p className="mt-1">上传 XRD 数据，设置高斯混合组分数量（通常 2-4 个），调整 σ² 系数和迭代次数后运行。输出各组分峰位、权重和 R 因子。</p>
        </details>
        <div><Label className="text-xs">XRD 数据文件</Label><Input type="file" accept=".csv,.xyd,.txt" className="text-xs h-8 mt-1" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setSampleName(f.name.replace(/\.[^.]+$/, "")); } }} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">样品名</Label><Input value={sampleName} onChange={e => setSampleName(e.target.value)} className="text-xs h-7 mt-0.5" /></div>
          <div><Label className="text-xs">组分数量</Label><Input value={numComponents} onChange={e => setNumComponents(e.target.value)} className="text-xs h-7 mt-0.5" type="number" min="1" max="8" /></div>
          <div><Label className="text-xs">σ² 系数</Label><Input value={sigmaCoef} onChange={e => setSigmaCoef(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="1" min="1" /></div>
          <div><Label className="text-xs">最大迭代</Label><Input value={maxIter} onChange={e => setMaxIter(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="500" min="100" /></div>
        </div>
        <Button className="w-full h-8 text-xs" onClick={handleRun} disabled={loading || !file}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 分析中...</> : <><Layers className="h-3.5 w-3.5 mr-1" /> 运行非晶态分析</>}
        </Button>
        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-muted/30 group cursor-pointer"
              onClick={() => onPreview({ src: result.imageBase64, caption: `非晶态分析 — ${sampleName}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="Amorphous" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            {result.data.components?.length > 0 && (
              <div className="text-[10px] text-muted-foreground max-h-20 overflow-y-auto">
                <p className="font-medium mb-0.5">拟合组分:</p>
                {result.data.components.map((c, i) => (
                  <p key={i}>#{i + 1}: μ={c.mu_2theta.toFixed(2)}° w={c.weight.toFixed(1)} σ²={c.sigma2.toFixed(2)}</p>
                ))}
                {result.data.rp_factor != null && <p>Rp = {result.data.rp_factor.toFixed(2)}%</p>}
                {result.data.interatomic_distance && <p>d ≈ {result.data.interatomic_distance} Å</p>}
              </div>
            )}
            <Button variant="default" size="sm" className="w-full h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, `非晶态分析 — ${sampleName}`)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
