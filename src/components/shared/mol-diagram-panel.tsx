"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, Atom, FileText, Expand, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { renderMolecule, renderReaction } from "@/services/mol-diagram";
import type { MolInfo } from "@/services/mol-diagram";

interface MolDiagramPanelProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
}

interface SmilesInput {
  id: number;
  smiles: string;
  label: string;
}

export function MolDiagramPanel({ onInsertToPaper }: MolDiagramPanelProps) {
  const [mode, setMode] = useState<"mol" | "reaction">("mol");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: { mols: MolInfo[] } } | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // 单分子
  const [smiles, setSmiles] = useState("CC(=O)O");
  const [molLabel, setMolLabel] = useState("");
  const [molTitle, setMolTitle] = useState("");

  // 反应式
  const [reactants, setReactants] = useState<SmilesInput[]>([
    { id: 1, smiles: "CC(=O)O", label: "Reactant 1" },
  ]);
  const [products, setProducts] = useState<SmilesInput[]>([
    { id: 2, smiles: "CCO", label: "Product 1" },
  ]);
  const [conditions, setConditions] = useState("");
  const [nextId, setNextId] = useState(3);

  const addInput = (list: SmilesInput[], setter: (v: SmilesInput[]) => void) => {
    setter([...list, { id: nextId, smiles: "", label: "" }]);
    setNextId(nextId + 1);
  };

  const updateInput = (list: SmilesInput[], setter: (v: SmilesInput[]) => void, id: number, field: "smiles" | "label", value: string) => {
    setter(list.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeInput = (list: SmilesInput[], setter: (v: SmilesInput[]) => void, id: number) => {
    setter(list.filter(item => item.id !== id));
  };

  const handleRender = async () => {
    setLoading(true);
    try {
      if (mode === "mol") {
        if (!smiles.trim()) { toast.error("请输入 SMILES"); return; }
        const json = await renderMolecule({
          smiles: smiles.trim(),
          label: molLabel || undefined,
        });
        setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: { mols: [json.data] } });
      } else {
        const validReactants = reactants.filter(r => r.smiles.trim());
        const validProducts = products.filter(p => p.smiles.trim());
        if (validReactants.length === 0 || validProducts.length === 0) {
          toast.error("请至少填写一个反应物和产物"); return;
        }
        const json = await renderReaction({
          title: molTitle || undefined,
          reactants: validReactants.map(r => ({ smiles: r.smiles, label: r.label || undefined })),
          products: validProducts.map(p => ({ smiles: p.smiles, label: p.label || undefined })),
          conditions: conditions || undefined,
        });
        setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      }
      toast.success("分子结构图生成成功");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "渲染失败");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">分子结构图绘制</h2>
        <p className="text-sm text-muted-foreground mt-1">通过 SMILES 表达式绘制分子结构和化学反应式</p>
      </div>

      <div className="flex gap-2 pb-2">
        <Button variant={mode === "mol" ? "default" : "outline"} size="sm" onClick={() => setMode("mol")}>单分子</Button>
        <Button variant={mode === "reaction" ? "default" : "outline"} size="sm" onClick={() => setMode("reaction")}>反应式</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 参数区 */}
        <div className="space-y-4">
          {mode === "mol" ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">SMILES 输入</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">SMILES</Label>
                  <Input value={smiles} onChange={e => setSmiles(e.target.value)}
                    className="text-xs h-8 mt-1 font-mono" placeholder="CC(=O)O" />
                </div>
                <div>
                  <Label className="text-xs">标签（可选）</Label>
                  <Input value={molLabel} onChange={e => setMolLabel(e.target.value)}
                    className="text-xs h-8 mt-1" placeholder="Acetic Acid" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Atom className="h-4 w-4" />反应式
                </CardTitle>
                <CardDescription className="text-xs">反应物 → 产物</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">标题</Label>
                  <Input value={molTitle} onChange={e => setMolTitle(e.target.value)}
                    className="text-xs h-8 mt-1" placeholder="Esterification" />
                </div>
                <div>
                  <Label className="text-xs">反应条件</Label>
                  <Input value={conditions} onChange={e => setConditions(e.target.value)}
                    className="text-xs h-8 mt-1 font-mono" placeholder="H2SO4, heat" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">反应物</Label>
                    <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => addInput(reactants, setReactants)}>
                      <Plus className="h-3 w-3 mr-0.5" />添加
                    </Button>
                  </div>
                  {reactants.map(r => (
                    <div key={r.id} className="flex gap-1 mb-1 items-center">
                      <Input className="text-[10px] h-7 flex-1 font-mono" placeholder="SMILES" value={r.smiles}
                        onChange={e => updateInput(reactants, setReactants, r.id, "smiles", e.target.value)} />
                      <Input className="text-[10px] h-7 w-20" placeholder="标签" value={r.label}
                        onChange={e => updateInput(reactants, setReactants, r.id, "label", e.target.value)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => removeInput(reactants, setReactants, r.id)}>
                        <Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">产物</Label>
                    <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => addInput(products, setProducts)}>
                      <Plus className="h-3 w-3 mr-0.5" />添加
                    </Button>
                  </div>
                  {products.map(p => (
                    <div key={p.id} className="flex gap-1 mb-1 items-center">
                      <Input className="text-[10px] h-7 flex-1 font-mono" placeholder="SMILES" value={p.smiles}
                        onChange={e => updateInput(products, setProducts, p.id, "smiles", e.target.value)} />
                      <Input className="text-[10px] h-7 w-20" placeholder="标签" value={p.label}
                        onChange={e => updateInput(products, setProducts, p.id, "label", e.target.value)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => removeInput(products, setProducts, p.id)}>
                        <Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button className="w-full h-9" onClick={handleRender} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 渲染中...</>
              : <><Atom className="h-4 w-4 mr-1" /> 生成结构图</>}
          </Button>
        </div>

        {/* 结果区 */}
        <div className="space-y-4">
          {!result && !loading && (
            <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
              <Atom className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>输入 SMILES 后生成分子结构图</p>
            </div>
          )}
          {loading && (
            <div className="border rounded-lg p-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
              <p>渲染分子结构中...</p>
            </div>
          )}
          {result && (
            <>
              <Card><CardContent className="p-4">
                <div className="relative rounded-md overflow-hidden border bg-white group cursor-pointer"
                  onClick={() => setPreviewImg(result.imageBase64)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.imageBase64} alt="Molecular diagram" className="w-full h-auto" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center">
                    <Expand className="h-8 w-8 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow-lg" />
                  </div>
                </div>
              </CardContent></Card>

              {result.data.mols.length > 0 && (
                <Card><CardContent className="p-3">
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    {result.data.mols.map((m, i) => (
                      <p key={i}>#{i + 1}: {m.formula} | MW={m.molWeight} | logP={m.logP}</p>
                    ))}
                  </div>
                </CardContent></Card>
              )}

              <Button className="w-full" onClick={() => onInsertToPaper(result.imageUrl, `分子结构图 — ${molLabel || molTitle || ""}`)}>
                <FileText className="h-4 w-4 mr-1" /> 插入到论文
              </Button>
            </>
          )}
        </div>
      </div>

      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Full" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 bg-black/50 text-white"
              onClick={() => setPreviewImg(null)}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
