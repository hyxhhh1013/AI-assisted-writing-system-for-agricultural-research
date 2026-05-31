"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Loader2, Box, Ruler, Layers, FileText, Download, Expand, X, ArrowLeft, Table2, Atom,
} from "lucide-react";
import { toast } from "sonner";
import { projectStore } from "@/lib/store";
import { runSimulation } from "@/services/xrd";
import type { SimulateData } from "@/services/xrd";
import { XpsCard } from "@/components/shared/xrd/xps-card";
import { MolDiagramPanel } from "@/components/shared/mol-diagram-panel";

export default function XrdLabPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">加载中...</div>}>
      <XrdLabContent />
    </Suspense>
  );
}

function XrdLabContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTool, setActiveTool] = useState<"simulation" | "xps" | "mol">("simulation");
  const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [activeSection, setActiveSection] = useState("results");

  useEffect(() => {
    projectStore.list().then(all => setProjects(all.map(p => ({ id: p.id, title: p.title }))));
  }, []);

  const insertToPaper = async (imageUrl: string, caption: string) => {
    if (!projectId) { toast.error("请先选择目标项目"); return; }
    try {
      const project = await projectStore.get(projectId);
      if (!project) { toast.error("项目未找到"); return; }
      const mdImage = `\n\n![${caption}](${imageUrl})\n\n`;
      const section = activeSection === "abstract" ? "abstract" : (project.sections[activeSection] ? activeSection : "results");
      const current = section === "abstract" ? (project.abstract || "") : (project.sections[section] || "");
      const updated = { ...project } as Record<string, unknown>;
      if (section === "abstract") { updated.abstract = current + mdImage; }
      else { updated.sections = { ...project.sections, [section]: current + mdImage }; }
      await projectStore.save(updated as any);
      toast.success(`已插入到 ${section} 章节`);
    } catch (err: any) { toast.error(err.message || "插入失败"); }
  };

  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-muted-foreground">加载中...</div>}>
    <div className="flex h-screen flex-col bg-[#faf9f6]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#1a5632]/10 bg-white/90 px-4 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
          onClick={() => router.push(projectId ? `/workbench?id=${projectId}` : "/projects")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-bold text-[#122820]">
          <Atom className="h-4 w-4 text-[#1a5632]" />
          XRD 实验室
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs">
          <Label className="text-xs text-muted-foreground">目标项目</Label>
          <Select value={projectId} onValueChange={v => v && setProjectId(v)}>
            <SelectTrigger className="h-7 w-48 text-xs"><SelectValue placeholder="选择论文项目..." /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.title || "未命名"}</SelectItem>)}</SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground ml-1">插入章节</Label>
          <Select value={activeSection} onValueChange={v => v && setActiveSection(v)}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abstract">摘要</SelectItem>
              <SelectItem value="introduction">引言</SelectItem>
              <SelectItem value="methods">材料与方法</SelectItem>
              <SelectItem value="results">结果与讨论</SelectItem>
              <SelectItem value="conclusion">结论</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="shrink-0 border-b border-[#1a5632]/10 bg-[#1a5632]/5">
        <div className="flex gap-1 px-4">
          <TabButton active={activeTool === "simulation"} onClick={() => setActiveTool("simulation")}><Ruler className="h-4 w-4" /> XRD 模拟</TabButton>
          <TabButton active={activeTool === "xps"} onClick={() => setActiveTool("xps")}><Layers className="h-4 w-4" /> XPS 分析</TabButton>
          <TabButton active={activeTool === "mol"} onClick={() => setActiveTool("mol")}><Atom className="h-4 w-4" /> 分子结构</TabButton>
        </div>
      </div>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          {activeTool === "simulation" && <SimulationCard onInsertToPaper={insertToPaper} />}
          {activeTool === "xps" && <XpsCard onInsertToPaper={insertToPaper} />}
          {activeTool === "mol" && <MolDiagramPanel onInsertToPaper={insertToPaper} />}
        </div>
      </main>
    </div>
    </Suspense>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

function SimulationCard({ onInsertToPaper }: { onInsertToPaper: (url: string, caption: string) => void }) {
  const [cifFile, setCifFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: SimulateData } | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [wavelength, setWavelength] = useState("CuKa");
  const [angleMin, setAngleMin] = useState("10");
  const [angleMax, setAngleMax] = useState("90");
  const [angleStep, setAngleStep] = useState("0.02");
  const [grainSize, setGrainSize] = useState("");
  const [zeroShift, setZeroShift] = useState("");
  const [thermoVib, setThermoVib] = useState("");
  const [simBg, setSimBg] = useState(false);

  const handleRun = async () => {
    if (!cifFile) { toast.error("请上传 CIF 文件"); return; }
    setLoading(true);
    try {
      const json = await runSimulation(cifFile, {
        title: title || "XRD Simulation", wavelength,
        two_theta_range: [parseFloat(angleMin), parseFloat(angleMax), parseFloat(angleStep)] as [number, number, number],
        grain_size: grainSize ? parseFloat(grainSize) : null,
        zero_shift: zeroShift ? parseFloat(zeroShift) : null,
        thermo_vib: thermoVib ? parseFloat(thermoVib) : null,
        background: simBg,
      });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`模拟完成，${json.data.n_peaks} 个衍射峰`);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">XRD 图谱模拟</h2>
        <p className="text-sm text-muted-foreground mt-1">从 CIF 结构文件模拟 X 射线衍射图谱，支持多种波长和仪器参数</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">输入文件</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label className="text-xs">CIF 结构文件</Label><Input type="file" accept=".cif" className="text-xs h-8 mt-1" onChange={e => { const f = e.target.files?.[0]; if (f) { setCifFile(f); setResult(null); setTitle(f.name.replace(/\.[^.]+$/, "")); } }} /></div>
              <div><Label className="text-xs">样品名称</Label><Input value={title} onChange={e => setTitle(e.target.value)} className="text-xs h-7 mt-0.5" placeholder="Sample" /></div>
            </CardContent>
          </Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">仪器参数</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label className="text-xs">辐射波长</Label>
                <Select value={wavelength} onValueChange={v => v && setWavelength(v)}>
                  <SelectTrigger className="text-xs h-7 mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CuKa">Cu Kα (1.5406 Å)</SelectItem>
                    <SelectItem value="MoKa">Mo Kα (0.7107 Å)</SelectItem>
                    <SelectItem value="CoKa">Co Kα (1.7889 Å)</SelectItem>
                    <SelectItem value="FeKa">Fe Kα (1.9360 Å)</SelectItem>
                    <SelectItem value="CrKa">Cr Kα (2.2897 Å)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">起始 2θ</Label><Input value={angleMin} onChange={e => setAngleMin(e.target.value)} className="text-xs h-7 mt-0.5" type="number" /></div>
                <div><Label className="text-xs">终止 2θ</Label><Input value={angleMax} onChange={e => setAngleMax(e.target.value)} className="text-xs h-7 mt-0.5" type="number" /></div>
                <div><Label className="text-xs">步长</Label><Input value={angleStep} onChange={e => setAngleStep(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="0.01" /></div>
              </div>
              <div><Label className="text-xs">晶粒尺寸 (nm，可选 5-30)</Label><Input value={grainSize} onChange={e => setGrainSize(e.target.value)} className="text-xs h-7 mt-0.5" type="number" placeholder="默认 Voigt 峰形" /></div>
            </CardContent>
          </Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">高级选项</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label className="text-xs">零位漂移 (°2θ)</Label><Input value={zeroShift} onChange={e => setZeroShift(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="0.1" placeholder="如: 0.5" /></div>
              <div><Label className="text-xs">热振动 (Å)</Label><Input value={thermoVib} onChange={e => setThermoVib(e.target.value)} className="text-xs h-7 mt-0.5" type="number" step="0.01" placeholder="0.05 — 0.5" /></div>
              <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={simBg} onChange={e => setSimBg(e.target.checked)} className="rounded border-gray-300" />模拟背景强度</label>
            </CardContent>
          </Card>
          <Button className="w-full h-9" onClick={handleRun} disabled={loading || !cifFile}>
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 模拟中...</> : <><Ruler className="h-4 w-4 mr-1" /> 运行模拟</>}
          </Button>
        </div>
        <div className="lg:col-span-2 space-y-4">
          {!result && !loading && (
            <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
              <Atom className="h-12 w-12 mx-auto mb-4 opacity-30" /><p>上传 CIF 文件并点击「运行模拟」</p>
            </div>
          )}
          {loading && (
            <div className="border rounded-lg p-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" /><p>正在模拟 XRD 图谱...</p>
            </div>
          )}
          {result && (
            <>
              <Card><CardContent className="p-4">
                <div className="relative rounded-md overflow-hidden border bg-muted/10 group cursor-pointer" onClick={() => setPreviewImg(result.imageBase64)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.imageBase64} alt="Simulation" className="w-full h-auto" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center">
                    <Expand className="h-8 w-8 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow-lg" />
                  </div>
                </div>
              </CardContent></Card>
              {result.data.peaks.length > 0 && (
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Table2 className="h-4 w-4" />衍射峰列表 ({result.data.n_peaks} 个)</CardTitle></CardHeader>
                  <CardContent><div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="border-b text-muted-foreground">
                        <th className="text-left py-1 pr-2">#</th><th className="text-left py-1 pr-2">H</th><th className="text-left py-1 pr-2">K</th>
                        <th className="text-left py-1 pr-2">L</th><th className="text-left py-1 pr-2">2θ (°)</th><th className="text-left py-1">Mult</th>
                      </tr></thead>
                      <tbody>{result.data.peaks.slice(0, 30).map((p, i) => (
                        <tr key={i} className="border-b border-muted/20">
                          <td className="py-0.5 pr-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-0.5 pr-2 font-mono">{p.hkl?.[0] ?? "-"}</td>
                          <td className="py-0.5 pr-2 font-mono">{p.hkl?.[1] ?? "-"}</td>
                          <td className="py-0.5 pr-2 font-mono">{p.hkl?.[2] ?? "-"}</td>
                          <td className="py-0.5 pr-2 font-mono font-medium">{p.two_theta.toFixed(3)}</td>
                          <td className="py-0.5 font-mono">{p.mult}</td>
                        </tr>))}</tbody>
                    </table>
                  </div></CardContent></Card>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => { const a = document.createElement("a"); a.href = result.imageBase64; a.download = `${title || "simulation"}.png`; a.click(); }}>
                  <Download className="h-4 w-4 mr-1" /> 下载 PNG
                </Button>
                <Button className="flex-1" onClick={() => onInsertToPaper(result.imageUrl, `XRD Simulation — ${title}`)}>
                  <FileText className="h-4 w-4 mr-1" /> 插入到论文
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Full" className="max-w-full max-h-[95vh] object-contain rounded-lg" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 bg-black/50 text-white" onClick={() => setPreviewImg(null)}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function XpsPlaceholder() {
  return (
    <div className="text-center py-20 text-muted-foreground">
      <Layers className="h-16 w-16 mx-auto mb-4 opacity-20" />
      <h3 className="text-lg font-medium mb-2">XPS 分析</h3>
      <p className="text-sm max-w-md mx-auto">X 射线光电子能谱分析模块开发中，支持峰分解、价态分析、定量计算。</p>
    </div>
  );
}
