"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, Atom, FileText, Expand } from "lucide-react";
import { toast } from "sonner";
import { renderMolecule, renderReaction } from "@/services/mol-diagram";
import type { MolInfo } from "@/services/mol-diagram";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface MolCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

export function MolCard({ onInsertToPaper, onPreview }: MolCardProps) {
  const [mode, setMode] = useState<"mol" | "rxn">("mol");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: { mols: MolInfo[] } } | null>(null);
  const [smiles, setSmiles] = useState("CC(=O)O");
  const [label, setLabel] = useState("");
  const [rxnSmiles, setRxnSmiles] = useState("CC(=O)O.CCO>>CC(=O)OCC");
  const [rxnLabel, setRxnLabel] = useState("");

  const handleRun = async () => {
    setLoading(true);
    try {
      if (mode === "mol") {
        if (!smiles.trim()) { toast.error("请输入 SMILES"); return; }
        const json = await renderMolecule({ smiles: smiles.trim(), label: label || undefined });
        setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: { mols: [json.data] } });
      } else {
        if (!rxnSmiles.trim()) { toast.error("请输入反应式 SMILES"); return; }
        const parts = rxnSmiles.split(">>");
        if (parts.length !== 2) { toast.error("格式: 反应物SMILES>>产物SMILES，用.分隔多个分子"); return; }
        const reactants = parts[0].split(".").filter(Boolean).map((s, i) => ({ smiles: s, label: `Reactant ${i + 1}` }));
        const products = parts[1].split(".").filter(Boolean).map((s, i) => ({ smiles: s, label: `Product ${i + 1}` }));
        if (reactants.length === 0 || products.length === 0) { toast.error("至少需要一个反应物和一个产物"); return; }
        const json = await renderReaction({ title: rxnLabel || undefined, reactants, products });
        setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      }
      toast.success("结构图生成成功");
    } catch (err: unknown) { toast.error(err instanceof Error ? getErrorMessage(err) : "渲染失败"); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Atom className="h-4 w-4" />分子结构图</CardTitle>
        <CardDescription className="text-xs">SMILES → 分子结构 / 反应式</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">用法说明</summary>
          <p className="mt-1">单分子模式：输入 SMILES 表达式（如 CC(=O)O）生成结构式。反应式模式：用 A.B→C.D 格式（. 分隔多个分子，→ 分隔反应物和产物）。</p>
        </details>
        <div className="flex gap-1">
          <Button variant={mode === "mol" ? "default" : "outline"} size="sm" className="flex-1 text-xs h-7" onClick={() => setMode("mol")}>单分子</Button>
          <Button variant={mode === "rxn" ? "default" : "outline"} size="sm" className="flex-1 text-xs h-7" onClick={() => setMode("rxn")}>反应式</Button>
        </div>
        {mode === "mol" ? (
          <>
            <div><Label className="text-xs">SMILES</Label><Input value={smiles} onChange={e => setSmiles(e.target.value)} className="text-xs h-7 mt-0.5 font-mono" /></div>
            <div><Label className="text-xs">标签</Label><Input value={label} onChange={e => setLabel(e.target.value)} className="text-xs h-7 mt-0.5" placeholder="Acetic Acid" /></div>
          </>
        ) : (
          <>
            <div><Label className="text-xs">反应式 (A.B{">>"}C.D)</Label><Input value={rxnSmiles} onChange={e => setRxnSmiles(e.target.value)} className="text-xs h-7 mt-0.5 font-mono" /></div>
            <div><Label className="text-xs">标题</Label><Input value={rxnLabel} onChange={e => setRxnLabel(e.target.value)} className="text-xs h-7 mt-0.5" placeholder="Esterification" /></div>
          </>
        )}
        <Button className="w-full h-8 text-xs" onClick={handleRun} disabled={loading}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 渲染中...</> : <><Atom className="h-3.5 w-3.5 mr-1" /> 生成结构图</>}
        </Button>
        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-white group cursor-pointer"
              onClick={() => onPreview({ src: result.imageBase64, caption: `分子结构 — ${label || rxnLabel}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="Mol" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            {result.data.mols.map((m, i) => (
              <p key={i} className="text-[10px] text-muted-foreground">{m.formula} | MW={m.molWeight} | logP={m.logP}</p>
            ))}
            <Button variant="default" size="sm" className="w-full h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, `分子结构 — ${label || rxnLabel}`)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
