"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { runVaspBand, runVaspDos, runVaspProcar } from "@/services/dft";
import { getErrorMessage } from "@/lib/error-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";
import {
  buildPlotInsertReplay,
  configString,
  type PlotToolPrefill,
} from "@/contracts/figure";

type VaspKind = "dos" | "band" | "procar";

interface VaspCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
  /** registry id：dft_vasp_dos | dft_vasp_band | dft_vasp_procar */
  figureId?: string;
}

function kindFromFigureId(figureId: string): VaspKind {
  if (figureId === "dft_vasp_band") return "band";
  if (figureId === "dft_vasp_procar") return "procar";
  return "dos";
}

function replayFromKind(kind: VaspKind): "dft_vasp_dos" | "dft_vasp_band" | "dft_vasp_procar" {
  if (kind === "band") return "dft_vasp_band";
  if (kind === "procar") return "dft_vasp_procar";
  return "dft_vasp_dos";
}

export function VaspCard({
  title: toolTitle,
  description,
  onInsertToPaper,
  prefill,
  figureId = "dft_vasp_dos",
}: VaspCardProps) {
  const [kind, setKind] = useState<VaspKind>(kindFromFigureId(figureId));
  const [doscar, setDoscar] = useState<File | null>(null);
  const [eigenval, setEigenval] = useState<File | null>(null);
  const [outcar, setOutcar] = useState<File | null>(null);
  const [procar, setProcar] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [symmetry, setSymmetry] = useState("Γ:0,X:0.5,M:0.75,Γ:1.0");
  const [orbitals, setOrbitals] = useState("s,p,d");
  const [ionIndices, setIonIndices] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imageBase64: string;
    imageUrl: string;
    summary: string;
  } | null>(null);

  useEffect(() => {
    if (!prefill) return;
    if (
      prefill.figureId !== "dft_vasp_dos" &&
      prefill.figureId !== "dft_vasp_band" &&
      prefill.figureId !== "dft_vasp_procar"
    ) {
      return;
    }
    setKind(kindFromFigureId(prefill.figureId));
    setTitle(configString(prefill.config, "title", ""));
    setSymmetry(configString(prefill.config, "symmetry_points", "Γ:0,X:0.5,M:0.75,Γ:1.0"));
    setOrbitals(configString(prefill.config, "project_orbitals", "s,p,d"));
    setIonIndices(configString(prefill.config, "ion_indices", ""));
    setResult(null);
  }, [prefill]);

  useEffect(() => {
    setKind(kindFromFigureId(figureId));
  }, [figureId]);

  const canGenerate =
    kind === "dos" ? Boolean(doscar) : kind === "band" ? Boolean(eigenval) : Boolean(procar);

  const handleRun = async () => {
    setLoading(true);
    try {
      if (kind === "dos") {
        if (!doscar) {
          toast.error("请上传 DOSCAR");
          return;
        }
        const json = await runVaspDos(doscar, {
          title: title || "DOS",
          orientation: "vertical",
          fill: true,
        });
        const ef = json.data.efermi;
        setResult({
          imageBase64: json.imageBase64,
          imageUrl: json.imageUrl,
          summary: `E-fermi=${ef ?? "?"} eV · NEDOS=${json.data.nedos ?? "?"}${
            json.data.n_ions_partial ? ` · 投影离子 ${json.data.n_ions_partial}` : ""
          }`,
        });
        toast.success("DOSCAR 出图完成");
      } else if (kind === "band") {
        if (!eigenval) {
          toast.error("请上传 EIGENVAL");
          return;
        }
        const json = await runVaspBand(eigenval, {
          doscar,
          outcar,
          config: {
            title: title || "Band structure",
            symmetry_points: symmetry,
            shift_to_fermi: true,
          },
        });
        setResult({
          imageBase64: json.imageBase64,
          imageUrl: json.imageUrl,
          summary: `nkpts=${json.data.nkpts} · nbands=${json.data.nbands} · E-fermi=${json.data.efermi ?? "?"}`,
        });
        toast.success("EIGENVAL 出图完成");
      } else {
        if (!procar) {
          toast.error("请上传 PROCAR");
          return;
        }
        const json = await runVaspProcar(procar, {
          doscar,
          outcar,
          config: {
            title: title || "Projected bands",
            symmetry_points: symmetry,
            project_orbitals: orbitals || "s,p,d",
            ion_indices: ionIndices || undefined,
            shift_to_fermi: true,
            fat_scale: 80,
          },
        });
        setResult({
          imageBase64: json.imageBase64,
          imageUrl: json.imageUrl,
          summary: `nkpts=${json.data.nkpts} · nbands=${json.data.nbands} · nions=${json.data.nions} · orb=${json.data.project_orbitals ?? orbitals}`,
        });
        toast.success("PROCAR 投影能带出图完成");
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const replayTool = replayFromKind(kind);
  const paneTitle =
    kind === "dos" ? "VASP DOSCAR" : kind === "band" ? "VASP EIGENVAL" : "VASP PROCAR";

  return (
    <PlotWorkspace
      title={toolTitle ?? paneTitle}
      description={
        description ??
        "上传 VASP 原生文本输出，自动解析为能带 / DOS / 轨道投影 fat bands"
      }
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div>
              <Label className="text-xs">模式</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  if (v === "dos" || v === "band" || v === "procar") {
                    setKind(v);
                    setResult(null);
                  }
                }}
              >
                <SelectTrigger className="mt-0.5 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dos">DOS（DOSCAR）</SelectItem>
                  <SelectItem value="band">能带（EIGENVAL）</SelectItem>
                  <SelectItem value="procar">投影能带（PROCAR）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {kind === "dos" ? (
              <div>
                <Label className="text-xs">DOSCAR</Label>
                <Input
                  type="file"
                  className="mt-0.5 h-8 text-xs"
                  onChange={(e) => setDoscar(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : kind === "band" ? (
              <>
                <div>
                  <Label className="text-xs">EIGENVAL（必需）</Label>
                  <Input
                    type="file"
                    className="mt-0.5 h-8 text-xs"
                    onChange={(e) => setEigenval(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label className="text-xs">DOSCAR（取 E-fermi，可选）</Label>
                  <Input
                    type="file"
                    className="mt-0.5 h-8 text-xs"
                    onChange={(e) => setDoscar(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label className="text-xs">OUTCAR（取 E-fermi，可选）</Label>
                  <Input
                    type="file"
                    className="mt-0.5 h-8 text-xs"
                    onChange={(e) => setOutcar(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label className="text-xs">高对称点（归一化 k：标签:位置）</Label>
                  <Input
                    value={symmetry}
                    onChange={(e) => setSymmetry(e.target.value)}
                    className="mt-0.5 h-8 text-xs"
                    placeholder="Γ:0,X:0.5,M:0.75,Γ:1.0"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs">PROCAR（必需）</Label>
                  <Input
                    type="file"
                    className="mt-0.5 h-8 text-xs"
                    onChange={(e) => setProcar(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label className="text-xs">DOSCAR（取 E-fermi，可选）</Label>
                  <Input
                    type="file"
                    className="mt-0.5 h-8 text-xs"
                    onChange={(e) => setDoscar(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label className="text-xs">OUTCAR（取 E-fermi，可选）</Label>
                  <Input
                    type="file"
                    className="mt-0.5 h-8 text-xs"
                    onChange={(e) => setOutcar(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label className="text-xs">投影轨道（s,p,d 或 tot）</Label>
                  <Input
                    value={orbitals}
                    onChange={(e) => setOrbitals(e.target.value)}
                    className="mt-0.5 h-8 text-xs"
                    placeholder="s,p,d"
                  />
                </div>
                <div>
                  <Label className="text-xs">离子序号（可选，1-based，逗号分隔）</Label>
                  <Input
                    value={ionIndices}
                    onChange={(e) => setIonIndices(e.target.value)}
                    className="mt-0.5 h-8 text-xs"
                    placeholder="留空=全部离子，如 1,2"
                  />
                </div>
                <div>
                  <Label className="text-xs">高对称点（归一化 k：标签:位置）</Label>
                  <Input
                    value={symmetry}
                    onChange={(e) => setSymmetry(e.target.value)}
                    className="mt-0.5 h-8 text-xs"
                    placeholder="Γ:0,X:0.5,M:0.75,Γ:1.0"
                  />
                </div>
              </>
            )}

            <div>
              <Label className="text-xs">图标题（可选）</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-0.5 h-8 text-xs"
              />
            </div>
            <p className="text-[10px] leading-relaxed text-[#6b7c72]">
              支持标准 VASP 文本 DOSCAR / EIGENVAL / PROCAR（lm decomposed）。
              无费米能级时可附带 DOSCAR 或 OUTCAR。二进制或非标准格式请先导出 CSV。
            </p>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="VASP 预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={() => void handleRun()}
          generateLabel={
            kind === "dos" ? "解析 DOSCAR" : kind === "band" ? "解析 EIGENVAL" : "解析 PROCAR"
          }
          imageSrc={result?.imageBase64}
          imageAlt={title || kind}
          emptyHint="在左侧上传 VASP 输出文件。"
          footer={
            result ? (
              <div className="space-y-2">
                <p className="text-[10px] text-[#6b7c72]">{result.summary}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => {
                      const cap =
                        title ||
                        (kind === "dos"
                          ? "DOS"
                          : kind === "band"
                            ? "Band structure"
                            : "Projected bands");
                      onInsertToPaper(
                        result.imageUrl,
                        cap,
                        buildPlotInsertReplay(replayTool, cap, {
                          title,
                          symmetry_points: symmetry,
                          project_orbitals: orbitals,
                          ion_indices: ionIndices,
                          kind,
                        }),
                      );
                    }}
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
