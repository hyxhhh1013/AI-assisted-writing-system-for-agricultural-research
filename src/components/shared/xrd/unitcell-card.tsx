"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Loader2, Box, FileText, Expand } from "lucide-react";
import { toast } from "sonner";
import { runUnitCell } from "@/services/xrd";
import type { UnitCellData } from "@/services/xrd";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

interface UnitCellCardProps {
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  onPreview: (img: PreviewImage | null) => void;
}

export function UnitCellCard({ onInsertToPaper, onPreview }: UnitCellCardProps) {
  const [cifFile, setCifFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: UnitCellData } | null>(null);
  const [title, setTitle] = useState("");

  const handleRun = async () => {
    if (!cifFile) { toast.error("请上传 CIF 文件"); return; }
    setLoading(true);
    try {
      const json = await runUnitCell(cifFile, { title: title || "Unit Cell" });
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success("晶胞可视化完成");
    } catch (err: unknown) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Box className="h-4 w-4" />晶胞可视化</CardTitle>
        <CardDescription className="text-xs">上传 CIF 文件生成 3D 晶胞结构图</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          <summary className="cursor-pointer font-medium text-[10px]">用法说明</summary>
          <p className="mt-1">上传 CIF 结构文件，点击生成 3D 晶胞可视化图。支持任意空间群的晶体结构，原子按元素着色并标注晶胞参数。</p>
        </details>
        <div><Label className="text-xs">CIF 结构文件</Label><Input type="file" accept=".cif" className="text-xs h-8 mt-1" onChange={e => { const f = e.target.files?.[0]; if (f) { setCifFile(f); setResult(null); setTitle(f.name.replace(/\.[^.]+$/, "")); } }} /></div>
        <div><Label className="text-xs">标题 (可选)</Label><Input value={title} onChange={e => setTitle(e.target.value)} className="text-xs h-7 mt-0.5" placeholder="NaCl Unit Cell" /></div>
        <Button className="w-full h-8 text-xs" onClick={handleRun} disabled={loading || !cifFile}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 生成中...</> : <><Box className="h-3.5 w-3.5 mr-1" /> 生成晶胞图</>}
        </Button>
        {result && (
          <div className="space-y-2 pt-1 border-t">
            <div className="relative rounded-md overflow-hidden border bg-muted/30 group cursor-pointer"
              onClick={() => onPreview({ src: result.imageBase64, caption: `晶胞 — ${title}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageBase64} alt="Unit Cell" className="w-full h-auto" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center">
                <Expand className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <p>a={result.data.lattice.a} b={result.data.lattice.b} c={result.data.lattice.c}</p>
              <p>α={result.data.lattice.alpha}° β={result.data.lattice.beta}° γ={result.data.lattice.gamma}°</p>
              <p>原子数: {result.data.n_atoms}</p>
            </div>
            <Button variant="default" size="sm" className="w-full h-7 text-xs" onClick={() => onInsertToPaper(result.imageUrl, `晶胞 — ${title}`)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入到论文
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
