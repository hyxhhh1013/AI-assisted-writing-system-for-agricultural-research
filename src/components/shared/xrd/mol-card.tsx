"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { renderMolecule, renderReaction } from "@/services/mol-diagram";
import { getErrorMessage } from "@/lib/error-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";
import type { MolInfo } from "@/services/mol-diagram";

export function MolCard({ title: toolTitle, description, onInsertToPaper }: PlotToolProps) {
  const [mode, setMode] = useState<"mol" | "rxn">("mol");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: { mols: MolInfo[] } } | null>(null);
  const [smiles, setSmiles] = useState("CC(=O)O");
  const [label, setLabel] = useState("");
  const [rxnSmiles, setRxnSmiles] = useState("CC(=O)O.CCO>>CC(=O)OCC");
  const [rxnLabel, setRxnLabel] = useState("");

  const canGenerate = mode === "mol" ? smiles.trim().length > 0 : rxnSmiles.trim().length > 0;

  const handleRun = async () => {
    setLoading(true);
    try {
      if (mode === "mol") {
        if (!smiles.trim()) {
          toast.error("请输入 SMILES");
          return;
        }
        const json = await renderMolecule({ smiles: smiles.trim(), label: label || undefined });
        setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: { mols: [json.data] } });
      } else {
        if (!rxnSmiles.trim()) {
          toast.error("请输入反应式 SMILES");
          return;
        }
        const parts = rxnSmiles.split(">>");
        if (parts.length !== 2) {
          toast.error("格式: 反应物SMILES>>产物SMILES，用.分隔多个分子");
          return;
        }
        const reactants = parts[0].split(".").filter(Boolean).map((s, i) => ({ smiles: s, label: `Reactant ${i + 1}` }));
        const products = parts[1].split(".").filter(Boolean).map((s, i) => ({ smiles: s, label: `Product ${i + 1}` }));
        if (reactants.length === 0 || products.length === 0) {
          toast.error("至少需要一个反应物和一个产物");
          return;
        }
        const json = await renderReaction({ title: rxnLabel || undefined, reactants, products });
        setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      }
      toast.success("结构图生成成功");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "渲染失败");
    } finally {
      setLoading(false);
    }
  };

  const caption = `分子结构 — ${label || rxnLabel || "structure"}`;

  return (
    <PlotWorkspace
      title={toolTitle ?? "分子结构图"}
      description={description ?? "SMILES 表达式生成分子结构或反应式示意图"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <details className="rounded bg-[#faf9f6] p-2 text-[10px] leading-relaxed text-[#6b7c72]">
              <summary className="cursor-pointer font-medium">用法说明</summary>
              <p className="mt-1">单分子：输入 SMILES（如 CC(=O)O）。反应式：A.B{">>"}C.D 格式，用 . 分隔多个分子。</p>
            </details>
            <div className="flex gap-1">
              <Button variant={mode === "mol" ? "default" : "outline"} size="sm" className="h-8 flex-1 text-xs" onClick={() => setMode("mol")}>
                单分子
              </Button>
              <Button variant={mode === "rxn" ? "default" : "outline"} size="sm" className="h-8 flex-1 text-xs" onClick={() => setMode("rxn")}>
                反应式
              </Button>
            </div>
            {mode === "mol" ? (
              <>
                <div>
                  <Label className="text-xs">SMILES</Label>
                  <Input value={smiles} onChange={(e) => setSmiles(e.target.value)} className="mt-0.5 h-8 font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">标签</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-0.5 h-8 text-xs" placeholder="Acetic Acid" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs">反应式 (A.B{">>"}C.D)</Label>
                  <Input value={rxnSmiles} onChange={(e) => setRxnSmiles(e.target.value)} className="mt-0.5 h-8 font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">标题</Label>
                  <Input value={rxnLabel} onChange={(e) => setRxnLabel(e.target.value)} className="mt-0.5 h-8 text-xs" placeholder="Esterification" />
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="结构预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={handleRun}
          generateLabel="生成结构图"
          imageSrc={result?.imageBase64}
          imageAlt={caption}
          footer={
            result ? (
              <div className="flex flex-col gap-2">
                {result.data.mols.map((m, i) => (
                  <p key={i} className="text-[10px] text-[#6b7c72]">
                    {m.formula} | MW={m.molWeight} | logP={m.logP}
                  </p>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => onInsertToPaper(result.imageUrl, caption)}
                  >
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
