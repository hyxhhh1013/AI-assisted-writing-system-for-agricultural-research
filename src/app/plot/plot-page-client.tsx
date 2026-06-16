"use client";

import { useState, useEffect, Suspense, useMemo, useCallback, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { getFigureRegistry } from "@/services/figures";
import { getProject } from "@/services/project";
import {
  chartConfigToPrefill,
  chartTypeToFigureId,
  collectChartConfigsFromSources,
  type ChartPanelPrefill,
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
import { ChartPanel } from "@/components/shared/chart-panel";
import { TablePanel } from "@/components/shared/table-panel";
import { FlowCard } from "@/components/shared/xrd/flow-card";
import { MolCard } from "@/components/shared/xrd/mol-card";
import { PeakFitCard } from "@/components/shared/xrd/peakfit-card";
import { BackgroundCard } from "@/components/shared/xrd/background-card";
import { UnitCellCard } from "@/components/shared/xrd/unitcell-card";
import { AmorphousCard } from "@/components/shared/xrd/amorphous-card";
import { BraggCard } from "@/components/shared/xrd/bragg-card";
import { XpsCard } from "@/components/shared/xrd/xps-card";
import { XrdSimulatePanel } from "@/components/shared/xrd/xrd-simulate-panel";
import { PlotInsertDialog } from "@/components/shared/plot-insert-dialog";
import { useGoBack } from "@/contexts/navigation-history";
import { workbenchFallback } from "@/lib/navigation";

import type { ChartRegistryField } from "@/contracts/chart-style";

/* ─── 类型 ─── */
interface FigureDef {
  id: string;
  name: string;
  category: string;
  description: string;
  endpoint: string;
  input_type: "tabular" | "json" | "form";
  example?: string;
  config_fields?: ChartRegistryField[];
}
interface CategoryDef {
  id: string;
  name: string;
  icon: string;
  order: number;
}
interface Registry {
  categories: CategoryDef[];
  figures: FigureDef[];
  global_style_fields?: FigureDef["config_fields"];
}

/* ─── 分类图标映射 ─── */
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  chart: BarChart,
  table: Table2,
  diagram: GitBranch,
  xrd: Radar,
};

/* ─── 图表类型图标映射 ─── */
const FIGURE_ICONS: Record<string, React.ElementType> = {
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

/* ─── 主组件 ─── */
function PlotContent() {
  const searchParams = useSearchParams();
  const goBack = useGoBack();
  const routeProjectId = searchParams.get("id");
  const figureParam = searchParams.get("figure");
  const chartIdxParam = searchParams.get("chartIdx");
  const chartIdx =
    chartIdxParam !== null && chartIdxParam !== "" ? Number.parseInt(chartIdxParam, 10) : null;
  const projectId = routeProjectId || "default";

  const [registry, setRegistry] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("chart");
  const [selectedFigure, setSelectedFigure] = useState<FigureDef | null>(null);
  const [chartPrefill, setChartPrefill] = useState<ChartPanelPrefill | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);

  // 插入对话框状态
  const [insertDialog, setInsertDialog] = useState<{
    open: boolean;
    imageUrl: string;
    caption: string;
    svgUrl?: string;
    pdfUrl?: string;
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
  }, [registry]);

  useEffect(() => {
    if (prefillApplied || !registry || !routeProjectId) return;
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

      if (targetFigureId) {
        const fig = registry.figures.find((f) => f.id === targetFigureId);
        if (fig) {
          setActiveCategory(fig.category);
          setSelectedFigure(fig);
        }
      }
      if (prefill) {
        setChartPrefill(prefill);
      }
      setPrefillApplied(true);
    });
  }, [registry, routeProjectId, figureParam, chartIdxParam, chartIdx, prefillApplied]);

  useEffect(() => {
    if (prefillApplied) return;
    if (categoryFigures.length > 0) {
      setSelectedFigure(categoryFigures[0]);
    }
  }, [activeCategory, categoryFigures, prefillApplied]);

  const handleInsertToPaper = useCallback((imageUrl: string, caption: string) => {
    setInsertDialog({ open: true, imageUrl, caption });
  }, []);

  const toolProps = useMemo(() => {
    if (!selectedFigure) return null;
    return {
      title: selectedFigure.name,
      description: selectedFigure.description,
      onInsertToPaper: handleInsertToPaper,
    };
  }, [selectedFigure, handleInsertToPaper]);

  /* ─── 渲染主内容区 ─── */
  const renderMainContent = () => {
    if (!selectedFigure || !toolProps) return null;

    // 数据图表
    if (selectedFigure.category === "chart") {
      const activePrefill =
        chartPrefill && selectedFigure.id === chartPrefill.figureId ? chartPrefill : null;
      return (
        <ChartPanel
          key={`${selectedFigure.id}-${activePrefill ? "prefill" : "default"}`}
          projectId={projectId}
          onInsertToPaper={handleInsertToPaper}
          registryEntry={selectedFigure}
          globalStyleFields={registry?.global_style_fields}
          prefill={activePrefill}
        />
      );
    }

    // 统计表格
    if (selectedFigure.category === "table") {
      return <TablePanel key={selectedFigure.id} {...toolProps} />;
    }

    // 示意图
    if (selectedFigure.id === "flow") {
      return <FlowCard key={selectedFigure.id} {...toolProps} />;
    }
    if (selectedFigure.id === "molecule") {
      return <MolCard key={selectedFigure.id} {...toolProps} />;
    }

    // XRD / XPS 系列
    const xrdPanels: Record<string, ReactNode> = {
      xrd_peakfit: <PeakFitCard key={selectedFigure.id} {...toolProps} />,
      xrd_background: <BackgroundCard key={selectedFigure.id} {...toolProps} />,
      xrd_unitcell: <UnitCellCard key={selectedFigure.id} {...toolProps} />,
      xrd_amorphous: <AmorphousCard key={selectedFigure.id} {...toolProps} />,
      xrd_bragg: <BraggCard key={selectedFigure.id} {...toolProps} />,
      xrd_xps: <XpsCard key={selectedFigure.id} {...toolProps} />,
      xrd_simulate: (
        <XrdSimulatePanel
          key={selectedFigure.id}
          {...toolProps}
          projectId={projectId}
        />
      ),
    };
    if (selectedFigure.category === "xrd") {
      return xrdPanels[selectedFigure.id] ?? null;
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6]">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
      </div>
    );
  }

  if (!registry) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6] text-sm text-[#6b7c72]">
        无法加载图形注册表，请检查服务是否正常启动。
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#faf9f6]">
      {/* ─── 顶部导航 ─── */}
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

        {/* 分类 Tab 栏 */}
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
              const active = selectedFigure?.id === fig.id;
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
          {renderMainContent()}
        </main>
      </div>

      {/* ─── 插入对话框 ─── */}
      <PlotInsertDialog
        open={insertDialog.open}
        onOpenChange={(open) => setInsertDialog((s) => ({ ...s, open }))}
        imageUrl={insertDialog.imageUrl}
        caption={insertDialog.caption}
        svgUrl={insertDialog.svgUrl}
        pdfUrl={insertDialog.pdfUrl}
        defaultProjectId={routeProjectId ?? undefined}
        figureId={selectedFigure?.id}
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
