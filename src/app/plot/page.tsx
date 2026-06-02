"use client";

import { useState, useEffect, Suspense, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFigureRegistry } from "@/services/figures";
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
} from "lucide-react";
import { ChartPanel } from "@/components/shared/chart-panel";
import { TablePanel } from "@/components/shared/table-panel";
import { XrdPanel } from "@/components/shared/xrd-panel";
import { FlowCard } from "@/components/shared/xrd/flow-card";
import { MolCard } from "@/components/shared/xrd/mol-card";
import { PlotInsertDialog } from "@/components/shared/plot-insert-dialog";

/* ─── 类型 ─── */
interface FigureDef {
  id: string;
  name: string;
  category: string;
  description: string;
  endpoint: string;
  input_type: "tabular" | "json" | "form";
  example?: string;
  config_fields?: { key: string; label: string; type: string; options?: string[] }[];
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id") || "default";

  const [registry, setRegistry] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("chart");
  const [selectedFigure, setSelectedFigure] = useState<FigureDef | null>(null);

  // 插入对话框状态
  const [insertDialog, setInsertDialog] = useState<{
    open: boolean;
    imageUrl: string;
    caption: string;
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
    if (categoryFigures.length > 0) {
      setSelectedFigure(categoryFigures[0]);
    }
  }, [activeCategory]);

  const handleInsertToPaper = useCallback((imageUrl: string, caption: string) => {
    setInsertDialog({ open: true, imageUrl, caption });
  }, []);

  /* ─── 渲染主内容区 ─── */
  const renderMainContent = () => {
    if (!selectedFigure) return null;

    // 数据图表
    if (selectedFigure.category === "chart") {
      return (
        <ChartPanel
          key={selectedFigure.id}
          projectId={projectId}
          onInsertToPaper={handleInsertToPaper}
          registryEntry={selectedFigure}
          layout="horizontal"
        />
      );
    }

    // 统计表格
    if (selectedFigure.category === "table") {
      return <TablePanel />;
    }

    // 流程图
    if (selectedFigure.id === "flow") {
      return (
        <FlowCard
          onInsertToPaper={handleInsertToPaper}
          onPreview={() => {}}
        />
      );
    }

    // 分子结构
    if (selectedFigure.id === "molecule") {
      return (
        <MolCard
          onInsertToPaper={handleInsertToPaper}
          onPreview={() => {}}
        />
      );
    }

    // XRD 系列工具
    if (selectedFigure.category === "xrd") {
      // 从 xrd_peakfit 映射到 XrdPanel 的 tool id
      const toolId = selectedFigure.id.replace("xrd_", "");
      return (
        <XrdPanel
          projectId={projectId}
          defaultTool={toolId as "peakfit" | "background" | "unitcell" | "amorphous" | "bragg" | "mol" | "flow" | "mechanism"}
          onInsertToPaper={handleInsertToPaper}
        />
      );
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
          onClick={() => router.back()}
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

      <div className="flex flex-1 overflow-hidden">
        {/* ─── 左侧图表列表 ─── */}
        <aside className="w-56 shrink-0 space-y-1 overflow-y-auto border-r border-[#1a5632]/10 bg-white/80 p-3">
          {categoryFigures.map((fig) => {
            const Icon = FIGURE_ICONS[fig.id] ?? BarChart3;
            return (
              <button
                key={fig.id}
                onClick={() => setSelectedFigure(fig)}
                className={`group w-full rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                  selectedFigure?.id === fig.id
                    ? "bg-[#1a5632] text-white shadow-sm"
                    : "text-[#3d4f46] hover:bg-[#1a5632]/8"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      selectedFigure?.id === fig.id
                        ? "text-white"
                        : "text-[#1a5632]/50 group-hover:text-[#1a5632]"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{fig.name}</div>
                    <div
                      className={`mt-0.5 text-[10px] leading-tight truncate ${
                        selectedFigure?.id === fig.id
                          ? "text-white/70"
                          : "text-[#6b7c72]"
                      }`}
                    >
                      {fig.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* ─── 主内容区 ─── */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderMainContent()}
        </main>
      </div>

      {/* ─── 插入对话框 ─── */}
      <PlotInsertDialog
        open={insertDialog.open}
        onOpenChange={(open) => setInsertDialog((s) => ({ ...s, open }))}
        imageUrl={insertDialog.imageUrl}
        caption={insertDialog.caption}
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
