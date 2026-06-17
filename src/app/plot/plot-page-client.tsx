"use client";

import { useState, useEffect, Suspense, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getFigureRegistry } from "@/services/figures";
import type { FigureDef, FigureRegistry } from "@/services/figures";
import { getProject } from "@/services/project";
import {
  chartConfigToPrefill,
  chartTypeToFigureId,
  collectChartConfigsFromSources,
  decodeFigureSpecParam,
  figureSpecToFlowPrefill,
  figureSpecToPrefill,
  figureToolToRegistryId,
  parseProjectCharts,
  type ChartPanelPrefill,
  type FlowPanelPrefill,
  type PlotInsertReplay,
} from "@/contracts/figure";
import { parseDataSources } from "@/contracts/project";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  GitBranch,
  Atom,
  Radar,
  Table2,
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  Grid3x3,
  Layers,
  GitBranch as ForestIcon,
} from "lucide-react";
import type { ElementType } from "react";
import { PlotFigurePanel } from "@/components/shared/plot/plot-figure-panel";
import { PlotInsertDialog } from "@/components/shared/plot-insert-dialog";
import { useGoBack } from "@/contexts/navigation-history";
import { workbenchFallback } from "@/lib/navigation";

const CATEGORY_ICONS: Record<string, ElementType> = {
  chart: BarChart,
  table: Table2,
  diagram: GitBranch,
  xrd: Radar,
};

const FIGURE_ICONS: Record<string, ElementType> = {
  bar_grouped: BarChart,
  bar_stacked: BarChart,
  bar_pct_stacked: BarChart,
  line: LineChart,
  scatter: ScatterChart,
  pie: PieChart,
  heatmap: Grid3x3,
  area: Layers,
  forest: ForestIcon,
  radar: Radar,
  table_three_line: Table2,
  flow: GitBranch,
  molecule: Atom,
  xrd_peakfit: Radar,
  xrd_background: Radar,
  xrd_unitcell: Radar,
  xrd_amorphous: Radar,
  xrd_bragg: Radar,
  xrd_simulate: Radar,
  xrd_xps: Radar,
};

function PlotContent() {
  const searchParams = useSearchParams();
  const goBack = useGoBack();
  const routeProjectId = searchParams.get("id");
  const figureParam = searchParams.get("figure");
  const chartIdxParam = searchParams.get("chartIdx");
  const figureSpecParam = searchParams.get("figureSpec");
  const chartAssetIdParam = searchParams.get("chartAssetId");
  const chartIdx =
    chartIdxParam !== null && chartIdxParam !== "" ? Number.parseInt(chartIdxParam, 10) : null;
  const projectId = routeProjectId || "default";

  const [registry, setRegistry] = useState<FigureRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("chart");
  const [selectedFigure, setSelectedFigure] = useState<FigureDef | null>(null);
  const [chartPrefill, setChartPrefill] = useState<ChartPanelPrefill | null>(null);
  const [flowPrefill, setFlowPrefill] = useState<FlowPanelPrefill | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);

  const [insertDialog, setInsertDialog] = useState<{
    open: boolean;
    imageUrl: string;
    caption: string;
    svgUrl?: string;
    pdfUrl?: string;
    figureSpecEnc?: string;
  }>({ open: false, imageUrl: "", caption: "" });

  useEffect(() => {
    getFigureRegistry()
      .then((data) => {
        setRegistry(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    if (!registry) return [];
    return [...registry.categories].sort((a, b) => a.order - b.order);
  }, [registry]);

  const categoryFigures = useMemo(() => {
    if (!registry) return [];
    return registry.figures.filter((f) => f.category === activeCategory);
  }, [registry, activeCategory]);

  useEffect(() => {
    if (registry && !selectedFigure) {
      const first = registry.figures[0];
      if (first) setSelectedFigure(first);
    }
  }, [registry, selectedFigure]);

  useEffect(() => {
    if (prefillApplied || !registry) return;

    const applyFigureSelection = (figureId: string) => {
      const fig = registry.figures.find((f) => f.id === figureId);
      if (fig) {
        setActiveCategory(fig.category);
        setSelectedFigure(fig);
      }
    };

    if (figureSpecParam) {
      const spec = decodeFigureSpecParam(figureSpecParam);
      if (spec) {
        applyFigureSelection(figureToolToRegistryId(spec.tool, spec.config));
        const prefill = figureSpecToPrefill(spec);
        if (prefill) setChartPrefill(prefill);
        const flow = figureSpecToFlowPrefill(spec);
        if (flow) setFlowPrefill(flow);
        setPrefillApplied(true);
        return;
      }
    }

    if (chartAssetIdParam && routeProjectId) {
      void getProject(routeProjectId).then((project) => {
        if (!project) return;
        const assets = parseProjectCharts(project.charts);
        const asset = assets.find((a) => a.id === chartAssetIdParam);
        if (!asset) return;
        applyFigureSelection(asset.figureId);
        if (asset.figureSpecEnc) {
          const spec = decodeFigureSpecParam(asset.figureSpecEnc);
          if (spec) {
            const prefill = figureSpecToPrefill(spec);
            if (prefill) setChartPrefill(prefill);
            const flow = figureSpecToFlowPrefill(spec);
            if (flow) setFlowPrefill(flow);
          }
        }
        setPrefillApplied(true);
      });
      return;
    }

    if (!routeProjectId) return;
    if (figureParam === null && chartIdxParam === null) return;

    void getProject(routeProjectId).then((project) => {
      if (!project) return;
      const configs = collectChartConfigsFromSources(parseDataSources(project));
      let targetFigureId = figureParam ?? undefined;
      let prefill: ChartPanelPrefill | null = null;

      if (chartIdx !== null && !Number.isNaN(chartIdx) && configs[chartIdx]) {
        const cfg = configs[chartIdx];
        targetFigureId = targetFigureId ?? chartTypeToFigureId(cfg.type);
        prefill = chartConfigToPrefill(cfg, targetFigureId);
      }

      if (targetFigureId) applyFigureSelection(targetFigureId);
      if (prefill) setChartPrefill(prefill);
      setPrefillApplied(true);
    });
  }, [
    registry,
    routeProjectId,
    figureParam,
    chartIdxParam,
    chartIdx,
    figureSpecParam,
    chartAssetIdParam,
    prefillApplied,
  ]);

  useEffect(() => {
    if (prefillApplied) return;
    if (categoryFigures.length > 0) {
      setSelectedFigure(categoryFigures[0]);
    }
  }, [activeCategory, categoryFigures, prefillApplied]);

  const handleInsertToPaper = useCallback(
    (imageUrl: string, caption: string, replay?: PlotInsertReplay) => {
      setInsertDialog({
        open: true,
        imageUrl,
        caption,
        figureSpecEnc: replay?.figureSpecEnc,
      });
    },
    [],
  );

  const toolProps = useMemo(() => {
    if (!selectedFigure) return null;
    return {
      title: selectedFigure.name,
      description: selectedFigure.description,
      onInsertToPaper: handleInsertToPaper,
    };
  }, [selectedFigure, handleInsertToPaper]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6]">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
      </div>
    );
  }

  if (!registry || !selectedFigure || !toolProps) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6] text-sm text-[#6b7c72]">
        无法加载图形注册表，请检查服务是否正常启动。
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#faf9f6]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#1a5632]/10 bg-white/90 px-4 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
          onClick={() => goBack(workbenchFallback(routeProjectId))}
          title="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="flex items-center gap-2 text-sm font-bold text-[#122820]">
          <BarChart3 className="h-4 w-4 text-[#1a5632]" />
          科学绘图
        </span>

        <div className="flex flex-1 justify-center">
          <div className="flex gap-1 rounded-lg bg-[#1a5632]/6 p-0.5">
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.id] ?? BarChart3;
              return (
                <Button
                  key={cat.id}
                  variant={activeCategory === cat.id ? "default" : "ghost"}
                  size="sm"
                  className={`h-8 text-xs gap-1.5 ${
                    activeCategory === cat.id
                      ? "bg-[#1a5632] hover:bg-[#144228]"
                      : "text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
                  }`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cat.name}
                </Button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-52 shrink-0 flex-col border-r border-[#1a5632]/10 bg-white/90">
          <div className="shrink-0 border-b border-[#1a5632]/8 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
              {categories.find((c) => c.id === activeCategory)?.name ?? "图形"}
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {categoryFigures.map((fig) => {
              const Icon = FIGURE_ICONS[fig.id] ?? BarChart3;
              const active = selectedFigure.id === fig.id;
              return (
                <button
                  key={fig.id}
                  onClick={() => setSelectedFigure(fig)}
                  title={fig.description}
                  className={`group w-full rounded-lg px-2.5 py-2 text-left transition-all ${
                    active
                      ? "bg-[#1a5632] text-white shadow-sm"
                      : "text-[#3d4f46] hover:bg-[#1a5632]/8"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        active ? "text-white" : "text-[#1a5632]/50 group-hover:text-[#1a5632]"
                      }`}
                    />
                    <span className="truncate text-xs font-medium">{fig.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <PlotFigurePanel
            figure={selectedFigure}
            registry={registry}
            projectId={projectId}
            toolProps={toolProps}
            chartPrefill={chartPrefill}
            flowPrefill={flowPrefill}
            onInsertToPaper={handleInsertToPaper}
          />
        </main>
      </div>

      <PlotInsertDialog
        open={insertDialog.open}
        onOpenChange={(open) => setInsertDialog((s) => ({ ...s, open }))}
        imageUrl={insertDialog.imageUrl}
        caption={insertDialog.caption}
        svgUrl={insertDialog.svgUrl}
        pdfUrl={insertDialog.pdfUrl}
        figureSpecEnc={insertDialog.figureSpecEnc}
        defaultProjectId={routeProjectId ?? undefined}
        figureId={selectedFigure.id}
      />
    </div>
  );
}

export default function PlotPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
        </div>
      }
    >
      <PlotContent />
    </Suspense>
  );
}
