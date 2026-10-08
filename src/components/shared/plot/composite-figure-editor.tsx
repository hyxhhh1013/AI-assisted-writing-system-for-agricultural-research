"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectChartAsset } from "@/contracts/figure";
import {
  assetToCompositePanel,
  compositePanelCountError,
  type CompositePanelDraft,
} from "@/lib/composite-figure";
import { renderCompositeFigure } from "@/services/composite-figure";
import { getProjectCharts } from "@/services/project";

interface CompositeFigureEditorProps {
  projectId: string | null;
  onInsert: (imageUrl: string, caption: string) => void;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function CompositeFigureEditor({ projectId, onInsert }: CompositeFigureEditorProps) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState<ProjectChartAsset[]>([]);
  const [panels, setPanels] = useState<CompositePanelDraft[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [title, setTitle] = useState("组图");
  const [cols, setCols] = useState<1 | 2 | 3>(2);
  const [preset, setPreset] = useState<"nature" | "agr_journal" | "print_bw">("agr_journal");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getProjectCharts(projectId).then((res) => {
      if (cancelled) return;
      setAssets(res.charts);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const usable = useMemo(
    () => assets.flatMap((asset) => {
      const panel = assetToCompositePanel(asset);
      return panel ? [panel] : [];
    }),
    [assets],
  );
  const active = panels.find((panel) => panel.key === activeKey) ?? panels[0] ?? null;

  const toggle = (panel: CompositePanelDraft) => {
    setPreviewUrl(null);
    setPanels((prev) => {
      if (prev.some((item) => item.key === panel.key)) {
        return prev.filter((item) => item.key !== panel.key);
      }
      if (prev.length >= 6) {
        toast.error("组图最多六张");
        return prev;
      }
      return [...prev, { ...panel }];
    });
    setActiveKey(panel.key);
  };

  const patchActive = (patch: Partial<CompositePanelDraft>) => {
    if (!active) return;
    setPreviewUrl(null);
    setPanels((prev) => prev.map((panel) => (
      panel.key === active.key ? { ...panel, ...patch } : panel
    )));
  };

  const move = (key: string, dir: -1 | 1) => {
    setPreviewUrl(null);
    setPanels((prev) => {
      const index = prev.findIndex((panel) => panel.key === key);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      if (!item) return prev;
      copy.splice(next, 0, item);
      return copy;
    });
  };

  const generate = async () => {
    const countError = compositePanelCountError(panels.length);
    if (countError) {
      toast.error(countError);
      return;
    }
    setBusy(true);
    try {
      const rendered = await renderCompositeFigure({
        title: title.trim() || "组图",
        preset,
        cols,
        panels: panels.map((panel) => ({
          chartType: panel.chartType,
          csv: panel.csv,
          title: panel.title,
          xLabel: panel.xLabel,
          yLabel: panel.yLabel,
          yMin: panel.yMin.trim() || undefined,
          yMax: panel.yMax.trim() || undefined,
          showLegend: panel.showLegend,
          palette: panel.palette || undefined,
          span: cols >= 2 ? panel.span : 1,
        })),
      });
      setPreviewUrl(rendered.imageUrl);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "组图生成失败");
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[#6b7c72]">
        先从工作台打开项目，再拼组图。
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
      <section className="min-h-0 overflow-y-auto border-r border-[#1a5632]/10 p-3">
        <p className="text-xs font-semibold text-[#1a5632]">可拼的数据图</p>
        <p className="mt-1 text-[10px] text-[#6b7c72]">只列出能回放数据的图。流程图和文生图不进这里。</p>
        {loading ? (
          <Loader2 className="mt-4 h-4 w-4 animate-spin text-[#6b7c72]" />
        ) : usable.length === 0 ? (
          <p className="mt-4 text-xs text-[#6b7c72]">这个项目还没有可回放的数据图。</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {usable.map((panel) => {
              const on = panels.some((item) => item.key === panel.key);
              return (
                <li key={panel.key}>
                  <button
                    type="button"
                    onClick={() => toggle(panel)}
                    className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
                      on
                        ? "border-[#1a5632]/40 bg-[#1a5632]/8"
                        : "border-transparent hover:bg-[#1a5632]/6"
                    }`}
                  >
                    <span className="line-clamp-2 font-medium text-[#122820]">{panel.sourceCaption}</span>
                    <span className="text-[10px] text-[#6b7c72]">{panel.chartType}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label className="text-[10px]">组图标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
          </div>
          <label className="space-y-1 text-[10px] text-[#6b7c72]">
            列数
            <select
              className="mt-1 block h-8 rounded-md border bg-white px-2 text-xs"
              value={cols}
              onChange={(e) => setCols(Number(e.target.value) as 1 | 2 | 3)}
            >
              <option value={1}>1 列</option>
              <option value={2}>2 列</option>
              <option value={3}>3 列</option>
            </select>
          </label>
          <label className="space-y-1 text-[10px] text-[#6b7c72]">
            样式
            <select
              className="mt-1 block h-8 rounded-md border bg-white px-2 text-xs"
              value={preset}
              onChange={(e) => setPreset(e.target.value as typeof preset)}
            >
              <option value="agr_journal">农业期刊</option>
              <option value="nature">Nature</option>
              <option value="print_bw">黑白</option>
            </select>
          </label>
        </div>

        <ol className="space-y-1">
          {panels.map((panel, index) => (
            <li key={panel.key} className="flex items-center gap-2 rounded-md border border-[#1a5632]/10 px-2 py-1">
              <button
                type="button"
                className={`min-w-0 flex-1 truncate text-left text-xs ${
                  active?.key === panel.key ? "font-semibold text-[#1a5632]" : ""
                }`}
                onClick={() => setActiveKey(panel.key)}
              >
                {LETTERS[index] ?? index + 1}. {panel.sourceCaption}
                {panel.span === 2 && cols >= 2 ? " · 占两列" : ""}
              </button>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => move(panel.key, -1)}>上移</Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => move(panel.key, 1)}>下移</Button>
            </li>
          ))}
        </ol>

        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void generate()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            生成预览
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!previewUrl}
            onClick={() => previewUrl && onInsert(previewUrl, title.trim() || "组图")}
          >
            插入论文
          </Button>
        </div>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={title} className="max-w-full rounded-md border bg-white" />
        ) : (
          <p className="text-xs text-[#6b7c72]">选好面板后生成预览。插入时可以替换正文里的旧图。</p>
        )}
      </section>

      <section className="min-h-0 overflow-y-auto border-l border-[#1a5632]/10 p-3">
        <p className="text-xs font-semibold text-[#1a5632]">细调当前格</p>
        {active ? (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-[#6b7c72]">{active.sourceCaption}</p>
            <Label className="text-[10px]">面板标题</Label>
            <Input className="h-8 text-xs" value={active.title} onChange={(e) => patchActive({ title: e.target.value })} />
            <Label className="text-[10px]">X 轴</Label>
            <Input className="h-8 text-xs" value={active.xLabel} onChange={(e) => patchActive({ xLabel: e.target.value })} />
            <Label className="text-[10px]">Y 轴</Label>
            <Input className="h-8 text-xs" value={active.yLabel} onChange={(e) => patchActive({ yLabel: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Y 最小</Label>
                <Input className="h-8 text-xs" value={active.yMin} onChange={(e) => patchActive({ yMin: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Y 最大</Label>
                <Input className="h-8 text-xs" value={active.yMax} onChange={(e) => patchActive({ yMax: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={active.showLegend}
                onChange={(e) => patchActive({ showLegend: e.target.checked })}
              />
              显示图例
            </label>
            <Label className="text-[10px]">配色</Label>
            <select
              className="h-8 w-full rounded-md border bg-white px-2 text-xs"
              value={active.palette}
              onChange={(e) => patchActive({ palette: e.target.value as CompositePanelDraft["palette"] })}
            >
              <option value="">跟随样式</option>
              <option value="nature">Nature</option>
              <option value="agr">农业</option>
              <option value="tol">色盲友好</option>
            </select>
            {cols >= 2 ? (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={active.span === 2}
                  onChange={(e) => patchActive({ span: e.target.checked ? 2 : 1 })}
                />
                这一格占两列
              </label>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[#6b7c72]">先从左边选入面板。</p>
        )}
      </section>
    </div>
  );
}
