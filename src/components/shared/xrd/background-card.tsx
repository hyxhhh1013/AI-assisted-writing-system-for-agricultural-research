"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, ImageIcon, FileText, Expand } from "lucide-react";
import { toast } from "sonner";
import { runBackgroundSubtraction } from "@/services/xrd";
import type { BackgroundData } from "@/services/xrd";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface BackgroundCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

export function BackgroundCard({ onInsertToPaper, onPreview }: BackgroundCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: BackgroundData } | null>(null);
  const [LFctg, setLFctg] = useState("0.5");
  const [windowLength, setWindowLength] = useState("17");
  const [bgModel, setBgModel] = useState("constant");
  const [sampleName, setSampleName] = useState("");

  const handleRun = async () => {
    if (!file) { toast.error("请先上传 XRD 数据文件"); return; }
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
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><ImageIcon className="h-4 w-4" />背景扣除</CardTitle>
        <CardDescription className="text-xs">FFT + Savitzky-Golay + Gaussian Process 背景建模</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">用法说明</summary>
          <p className="mt-1">上传 XRD 数据，选择背景模型（Constant/Polynomial/Gaussian），调整低频滤波参数后运行。生成原始谱线 + 背景曲线 + 扣除背景后的对比图。</p>
        </details>
        <div>
          <Label className="text-xs">XRD 数据文件 (CSV/XYD)</Label>
          <Input type="file" accept=".csv,.xyd,.txt,.xlsx" className="text-xs h-8 mt-1" onChange={e => {
            const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setSampleName(f.name.replace(/\.[^.]+$/, "")); }
          }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">样品名</Label><Input value={sampleName} onChange={e => setSampleName(e.target.value)} className="text-xs h-7 mt-0.5" /></div>
          <div><Label className="text-xs">背景模型</Label>
            <Select value={bgModel} onValueChange={v => v && setBgModel(v)}>
              <SelectTrigger className="text-xs h-7 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="constant">Constant</SelectItem>
                <SelectItem value="polynomial">Polynomial</SelectItem>
                <SelectItem value="multivariate gaussian">Gaussian</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">低频滤波</Label><Input value={LFctg} onChange={e => setLFctg(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="0.1" min="0" max="1" /></div>
          <div><Label className="text-xs">窗口长度</Label><Input value={windowLength} onChange={e => setWindowLength(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="2" min="5" /></div>
        </div>
        <Button className="w-full h-8 text-xs" onClick={handleRun} disabled={loading || !file}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 处理中...</> : <><ImageIcon className="h-3.5 w-3.5 mr-1" /> 运行背景扣除</>}
        </Button>
        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-muted/30 group cursor-pointer"
              onClick={() => onPreview({ src: result.imageBase64, caption: `背景扣除 — ${sampleName}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="Background" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            <Button variant="default" size="sm" className="w-full h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, `背景扣除 — ${sampleName}`)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
