"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { runUnitCell } from "@/services/xrd";
import type { UnitCellData } from "@/services/xrd";
import { getErrorMessage } from "@/lib/error-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";

export function UnitCellCard({ title: toolTitle, description, onInsertToPaper }: PlotToolProps) {
  const [cifFile, setCifFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: UnitCellData } | null>(null);
  const [title, setTitle] = useState("");

  const handleRun = async () => {
    if (!cifFile) {
      toast.error("请上传 CIF 文件");
      return;
    }
    setLoading(true);
    try {
      const json = await runUnitCell(cifFile, { title: title || "Unit Cell" });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success("晶胞可视化完成");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlotWorkspace
      title={toolTitle ?? "晶胞可视化"}
      description={description ?? "上传 CIF 文件生成 3D 晶胞结构图"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div>
              <Label className="text-xs">CIF 结构文件</Label>
              <Input
                type="file"
                accept=".cif"
                className="mt-1 h-8 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCifFile(f);
                    setResult(null);
                    setTitle(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">标题 (可选)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" placeholder="NaCl Unit Cell" />
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="结构预览"
          loading={loading}
          canGenerate={Boolean(cifFile)}
          onGenerate={handleRun}
          generateLabel="生成晶胞图"
          imageSrc={result?.imageBase64}
          imageAlt={`晶胞 — ${title}`}
          emptyHint="在左侧上传 CIF 结构文件。"
          footer={
            result ? (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b7c72]">
                  <p>a={result.data.lattice.a} b={result.data.lattice.b} c={result.data.lattice.c}</p>
                  <p>α={result.data.lattice.alpha}° β={result.data.lattice.beta}° γ={result.data.lattice.gamma}°</p>
                  <p>原子数: {result.data.n_atoms}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button size="sm" className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]" onClick={() => onInsertToPaper(result.imageUrl, `晶胞 — ${title}`)}>
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
