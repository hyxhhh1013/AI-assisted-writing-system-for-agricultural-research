"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Loader2, Layers, FileText, Expand, Table2, Plus, X,
} from "lucide-react";
import { toast } from "sonner";
import { runXpsAnalysis, runBackgroundSubtraction } from "@/services/xrd";
import type { XpsData } from "@/services/xrd";

interface XpsCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
}

interface AtomRow {
  id: number;
  element: string;
  orbital: string;
  energy: string;
}

export function XpsCard({ onInsertToPaper }: XpsCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: XpsData } | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [energyMin, setEnergyMin] = useState("");
  const [energyMax, setEnergyMax] = useState("");
  const [iterMax, setIterMax] = useState("300");
  const [atoms, setAtoms] = useState<AtomRow[]>([
    { id: 1, element: "Cu", orbital: "2p3/2", energy: "932.6" },
  ]);
  const [nextId, setNextId] = useState(2);

  const addAtom = () => {
    setAtoms([...atoms, { id: nextId, element: "", orbital: "", energy: "" }]);
    setNextId(nextId + 1);
  };

  const removeAtom = (id: number) => {
    setAtoms(atoms.filter(a => a.id !== id));
  };

  const updateAtom = (id: number, field: keyof AtomRow, value: string) => {
    setAtoms(atoms.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleRun = async () => {
    if (!file) { toast.error("请上传 XPS 数据文件"); return; }

    const validAtoms = atoms.filter(a => a.element && a.orbital && a.energy);
    if (validAtoms.length === 0) {
      toast.error("请至少添加一个原子标识符");
      return;
    }

    setLoading(true);
    try {
      const atomIdentifiers: [string, string, number][] = validAtoms.map(a => [
        a.element, a.orbital, parseFloat(a.energy),
      ]);

      const config: Record<string, any> = {
        title: title || "XPS Analysis",
        atom_identifiers: atomIdentifiers,
        iter_max: parseInt(iterMax),
      };
      if (energyMin && energyMax) {
        config.energy_range = [parseFloat(energyMin), parseFloat(energyMax)];
      }

      const json = await runXpsAnalysis(file, config as any);
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`XPS 分析完成，R因子: ${json.data.rp?.toFixed(2) || "N/A"}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">XPS 分析</h2>
        <p className="text-sm text-muted-foreground mt-1">
          X 射线光电子能谱分解，支持价态分析、峰拟合
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Parameters */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">数据文件</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">XPS 数据 (CSV: 结合能, 强度)</Label>
                <Input type="file" accept=".csv,.txt" className="text-xs h-8 mt-1"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setTitle(f.name.replace(/\.[^.]+$/, "")); } }} />
              </div>
              <div><Label className="text-xs">分析标题</Label><Input value={title} onChange={e => setTitle(e.target.value)} className="text-xs h-7 mt-0.5" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">能量范围 (起)</Label><Input value={energyMin} onChange={e => setEnergyMin(e.target.value)} className="text-xs h-7 mt-0.5" type="number" /></div>
                <div><Label className="text-xs">能量范围 (止)</Label><Input value={energyMax} onChange={e => setEnergyMax(e.target.value)} className="text-xs h-7 mt-0.5" type="number" /></div>
              </div>
              <div><Label className="text-xs">最大迭代</Label><Input value={iterMax} onChange={e => setIterMax(e.target.value)} className="text-xs h-7 mt-0.5" type="number" min="100" step="100" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" />原子标识符</CardTitle>
              <CardDescription className="text-xs">元素 / 轨道 / 结合能 (eV)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {atoms.map(atom => (
                <div key={atom.id} className="flex gap-1 items-end">
                  <div className="flex-1">
                    <span className="text-[9px] text-muted-foreground">元素</span>
                    <Input value={atom.element} onChange={e => updateAtom(atom.id, "element", e.target.value)}
                      className="text-[10px] h-7" placeholder="Cu" />
                  </div>
                  <div className="flex-1">
                    <span className="text-[9px] text-muted-foreground">轨道</span>
                    <Input value={atom.orbital} onChange={e => updateAtom(atom.id, "orbital", e.target.value)}
                      className="text-[10px] h-7" placeholder="2p3/2" />
                  </div>
                  <div className="flex-[1.5]">
                    <span className="text-[9px] text-muted-foreground">能量 (eV)</span>
                    <Input value={atom.energy} onChange={e => updateAtom(atom.id, "energy", e.target.value)}
                      className="text-[10px] h-7" type="number" placeholder="932.6" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAtom(atom.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addAtom}>
                <Plus className="h-3 w-3 mr-1" /> 添加组分
              </Button>
            </CardContent>
          </Card>

          <Button className="w-full h-9" onClick={handleRun} disabled={loading || !file}>
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 分析中...</>
              : <><Layers className="h-4 w-4 mr-1" /> 运行 XPS 分析</>}
          </Button>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !loading && (
            <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>上传 XPS 数据并配置原子标识符</p>
            </div>
          )}
          {loading && (
            <div className="border rounded-lg p-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
              <p>XPS 分解计算中，可能需要 1-5 分钟...</p>
            </div>
          )}
          {result && (
            <>
              <Card><CardContent className="p-4">
                <div className="relative rounded-md overflow-hidden border bg-muted/10 group cursor-pointer"
                  onClick={() => setPreviewImg(result.imageBase64)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.imageBase64} alt="XPS" className="w-full h-auto" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center">
                    <Expand className="h-8 w-8 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow-lg" />
                  </div>
                </div>
              </CardContent></Card>

              {result.data.components.length > 0 && (
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                  <Table2 className="h-4 w-4" />峰参数 ({result.data.n_components})
                </CardTitle></CardHeader>
                  <CardContent>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead><tr className="border-b text-muted-foreground">
                          <th className="text-left py-1 pr-2">#</th>
                          <th className="text-left py-1 pr-2">BE (eV)</th>
                          <th className="text-left py-1 pr-2">FWHM</th>
                          <th className="text-left py-1 pr-2">Weight</th>
                          <th className="text-left py-1 pr-2">Asym</th>
                          <th className="text-left py-1">Area</th>
                        </tr></thead>
                        <tbody>{result.data.components.map((c, i) => (
                          <tr key={i} className="border-b border-muted/20">
                            <td className="py-0.5 pr-2 text-muted-foreground">{i + 1}</td>
                            <td className="py-0.5 pr-2 font-mono font-medium">{c.mu.toFixed(2)}</td>
                            <td className="py-0.5 pr-2 font-mono">{c.fwhm.toFixed(3)}</td>
                            <td className="py-0.5 pr-2 font-mono">{c.weight.toFixed(1)}</td>
                            <td className="py-0.5 pr-2 font-mono">{c.asymmetry.toFixed(3)}</td>
                            <td className="py-0.5 font-mono">{c.sigma2.toFixed(2)}</td>
                          </tr>))}</tbody>
                      </table>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-2 flex gap-4">
                      {result.data.rp != null && <span>Rp = {result.data.rp.toFixed(2)}%</span>}
                      {result.data.rwp != null && <span>Rwp = {result.data.rwp.toFixed(2)}%</span>}
                      {result.data.rsquare != null && <span>R² = {result.data.rsquare.toFixed(4)}</span>}
                      <span>迭代: {result.data.iterations}</span>
                    </div>
                  </CardContent></Card>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1"
                  onClick={() => { const a = document.createElement("a"); a.href = result.imageBase64; a.download = `${title || "xps"}.png`; a.click(); }}>
                  <FileText className="h-4 w-4 mr-1" /> 下载 PNG
                </Button>
                <Button className="flex-1" onClick={() => onInsertToPaper(result.imageUrl, `XPS — ${title}`)}>
                  <FileText className="h-4 w-4 mr-1" /> 插入到论文
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full-screen preview */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Full" className="max-w-full max-h-[95vh] object-contain rounded-lg" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 bg-black/50 text-white"
              onClick={() => setPreviewImg(null)}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
