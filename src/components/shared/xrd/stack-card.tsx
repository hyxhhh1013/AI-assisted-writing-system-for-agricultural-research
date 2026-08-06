"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { runXrdStack } from "@/services/xrd";
import type { XrdStackData } from "@/services/xrd";
import { getErrorMessage } from "@/lib/error-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";
import {
  buildPlotInsertReplay,
  configNumberString,
  configString,
  type PlotToolPrefill,
} from "@/contracts/figure";

interface StackCardProps extends PlotToolProps {
  prefill?: PlotToolPrefill | null;
}

export function StackCard({ title: toolTitle, description, onInsertToPaper, prefill }: StackCardProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [labelText, setLabelText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageBase64: string; imageUrl: string; data: XrdStackData } | null>(null);
  const [title, setTitle] = useState("");
  const [offset, setOffset] = useState("0.15");
  const [normalize, setNormalize] = useState(true);

  useEffect(() => {
    if (!prefill || prefill.figureId !== "xrd_stack") return;
    const c = prefill.config;
    setTitle(configString(c, "title", ""));
    setOffset(configNumberString(c, "offset", "0.15"));
    setNormalize(c.normalize !== false && c.normalize !== "false");
    setResult(null);
  }, [prefill]);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).slice(0, 12);
    setFiles(next);
    if (!labelText.trim()) {
      setLabelText(next.map((f) => f.name.replace(/\.[^.]+$/, "")).join("\n"));
    }
    setResult(null);
  };

  const handleRun = async () => {
    if (files.length === 0) {
      toast.error("请上传至少一条 XRD 数据文件");
      return;
    }
    setLoading(true);
    try {
      const labels = labelText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const json = await runXrdStack(
        files,
        {
          title: title || "XRD Patterns",
          offset: parseFloat(offset) || 0.15,
          normalize,
        },
        labels.length > 0 ? labels : undefined,
      );
      setResult({ imageBase64: json.imageBase64, imageUrl: json.imageUrl, data: json.data });
      toast.success(`已叠加 ${json.data.n_spectra} 条谱`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const buildReplayConfig = () => ({
    title,
    offset,
    normalize,
    labels: labelText,
  });

  return (
    <PlotWorkspace
      title={toolTitle ?? "XRD 多谱叠加"}
      description={description ?? "多条 XRD 谱垂直 offset 叠加（Jade/Origin 风格）"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-4 pb-5 pt-3">
            <div>
              <Label className="text-xs">XRD 数据文件（可多选）</Label>
              <Input
                type="file"
                accept=".csv,.txt,.tsv,.xy,.xyd,.ras,.raw,.uxd,.dif,.xlsx,.xls"
                multiple
                className="mt-0.5 h-8 text-xs"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {files.length > 0 && (
                <p className="mt-1 text-[10px] text-[#6b7c72]">已选 {files.length} 个文件</p>
              )}
            </div>
            <div>
              <Label className="text-xs">图例标签（每行一个，可选）</Label>
              <textarea
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                className="mt-0.5 h-24 w-full resize-none rounded-md border bg-background px-2 py-1 font-mono text-[10px]"
                placeholder="Sample A&#10;Sample B"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">偏移比例</Label>
                <Input
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                  type="number"
                  step="0.05"
                  min="0"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs text-[#3d4f46]">
                  <input
                    type="checkbox"
                    checked={normalize}
                    onChange={(e) => setNormalize(e.target.checked)}
                  />
                  归一化后叠加
                </label>
              </div>
            </div>
            <div>
              <Label className="text-xs">图标题（可选）</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-0.5 h-8 text-xs"
              />
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="多谱预览"
          loading={loading}
          canGenerate={files.length > 0}
          onGenerate={handleRun}
          generateLabel="生成叠加图"
          imageSrc={result?.imageBase64}
          imageAlt={`XRD stack — ${title || result?.data.n_spectra}`}
          emptyHint="在左侧上传多条 XRD CSV/Excel。"
          footer={
            result ? (
              <div className="space-y-2">
                <p className="text-[10px] text-[#6b7c72]">
                  {result.data.n_spectra} 条谱
                  {result.data.normalize ? " · 已归一化" : ""} · offset={result.data.offset}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs font-medium text-[#6b7c72]">导出与插入</span>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => {
                      const cap = title || `XRD 多谱叠加 (${result.data.n_spectra})`;
                      onInsertToPaper(
                        result.imageUrl,
                        cap,
                        buildPlotInsertReplay("xrd_stack", cap, buildReplayConfig()),
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
