"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, Ruler, FileText, Expand } from "lucide-react";
import { toast } from "sonner";
import { runBraggOptimization } from "@/services/xrd";
import type { BraggData } from "@/services/xrd";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface BraggCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

export function BraggCard({ onInsertToPaper, onPreview }: BraggCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: BraggData } | null>(null);
  const [crystalSys, setCrystalSys] = useState("1");
  const [a, setA] = useState("4.0"); const [b, setB] = useState("4.0"); const [c, setC] = useState("4.0");
  const [alpha, setAlpha] = useState("90"); const [beta, setBeta] = useState("90"); const [gamma, setGamma] = useState("90");
  const [hklInput, setHklInput] = useState("1 1 1\n2 0 0\n2 2 0\n3 1 1\n2 2 2");
  const [angleInput, setAngleInput] = useState("38.2\n44.4\n64.6\n77.6\n81.8");
  const [wavelength, setWavelength] = useState("1.54056");
  const [title, setTitle] = useState("");

  const handleRun = async () => {
    const hkl = hklInput.trim().split("\n").map(l => l.trim().split(/\s+/).map(Number)).filter(arr => arr.length === 3) as [number, number, number][];
    const angles = angleInput.trim().split("\n").map(l => parseFloat(l.trim())).filter(v => !isNaN(v));
    if (hkl.length === 0 || angles.length === 0) { toast.error("请填写 HKL 指数和衍射角"); return; }
    if (hkl.length !== angles.length) { toast.error("HKL 行数与衍射角数不一致"); return; }
    setLoading(true);
    try {
      const json = await runBraggOptimization({
        crystal_system: parseInt(crystalSys),
        lattice_init: [parseFloat(a), parseFloat(b), parseFloat(c), parseFloat(alpha), parseFloat(beta), parseFloat(gamma)],
        hkl, exp_angles: angles,
        wavelength: parseFloat(wavelength),
        title: title || "Bragg Optimization",
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`优化完成! RMS 误差: ${json.data.rms_opt}° (改善 ${json.data.improvement_pct}%)`);
    } catch (err: unknown) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Ruler className="h-4 w-4" />布拉格优化</CardTitle>
        <CardDescription className="text-xs">梯度下降法优化晶格常数</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">用法说明</summary>
          <p className="mt-1">输入实验测得的衍射角 2θ、对应 HKL 晶面指数和初始晶格参数，选择晶系后运行。程序通过梯度下降法优化晶格常数使计算与实验角度的 RMS 误差最小。</p>
        </details>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">晶系</Label>
            <Select value={crystalSys} onValueChange={v => v && setCrystalSys(v)}>
              <SelectTrigger className="text-xs h-7 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Cubic</SelectItem><SelectItem value="2">Hexagonal</SelectItem>
                <SelectItem value="3">Tetragonal</SelectItem><SelectItem value="4">Orthorhombic</SelectItem>
                <SelectItem value="5">Rhombohedral</SelectItem><SelectItem value="6">Monoclinic</SelectItem>
                <SelectItem value="7">Triclinic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">波长 (Å)</Label><Input value={wavelength} onChange={e => setWavelength(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="0.0001" /></div>
        </div>
        <div><Label className="text-xs">初始晶格参数</Label>
          <div className="grid grid-cols-6 gap-1 mt-0.5">
            {[{ id: "a", v: a, s: setA }, { id: "b", v: b, s: setB }, { id: "c", v: c, s: setC },
              { id: "α", v: alpha, s: setAlpha }, { id: "β", v: beta, s: setBeta }, { id: "γ", v: gamma, s: setGamma }]
              .map(p => (<div key={p.id}><span className="text-[9px] text-muted-foreground">{p.id}</span><Input value={p.v} onChange={e => p.s(e.target.value)} className="text-[10px] h-6 mt-0" type="number" step="0.1" /></div>))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">HKL (每行一组)</Label><textarea value={hklInput} onChange={e => setHklInput(e.target.value)} className="text-[10px] h-20 mt-0.5 font-mono w-full rounded-md border bg-background px-2 py-1 resize-none" /></div>
          <div><Label className="text-xs">实验 2θ (°)</Label><textarea value={angleInput} onChange={e => setAngleInput(e.target.value)} className="text-[10px] h-20 mt-0.5 font-mono w-full rounded-md border bg-background px-2 py-1 resize-none" /></div>
        </div>
        <Button className="w-full h-8 text-xs" onClick={handleRun} disabled={loading}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 优化中...</> : <><Ruler className="h-3.5 w-3.5 mr-1" /> 运行优化</>}
        </Button>
        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-muted/30 group cursor-pointer"
              onClick={() => onPreview({ src: result.imageBase64, caption: `布拉格优化 — ${title || result.data.crystal_system}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="Bragg" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <p>优化: a={result.data.lattice_optimized.a} b={result.data.lattice_optimized.b} c={result.data.lattice_optimized.c}</p>
              <p>RMS: {result.data.rms_init}° → {result.data.rms_opt}° ({result.data.improvement_pct}% 改善)</p>
            </div>
            <Button variant="default" size="sm" className="w-full h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, `布拉格优化 — ${result.data.crystal_system}`)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
