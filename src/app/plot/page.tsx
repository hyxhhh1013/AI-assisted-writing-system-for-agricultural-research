"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";
import { ChartPanel } from "@/components/shared/chart-panel";
import { TablePanel } from "@/components/shared/table-panel";

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

function PlotContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id") || "default";

  const [registry, setRegistry] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("chart");
  const [selectedFigure, setSelectedFigure] = useState<FigureDef | null>(null);

  useEffect(() => {
    fetch("/api/figures/registry")
      .then(r => r.json())
      .then(data => { setRegistry(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    if (!registry) return [];
    return [...registry.categories].sort((a, b) => a.order - b.order);
  }, [registry]);

  const categoryFigures = useMemo(() => {
    if (!registry) return [];
    return registry.figures.filter(f => f.category === activeCategory);
  }, [registry, activeCategory]);

  // 首次加载时选中第一个图类型
  useEffect(() => {
    if (registry && !selectedFigure) {
      const first = registry.figures[0];
      if (first) setSelectedFigure(first);
    }
  }, [registry]);

  // 切换分类时自动选中第一个图类型
  useEffect(() => {
    if (categoryFigures.length > 0) {
      setSelectedFigure(categoryFigures[0]);
    }
  }, [activeCategory]);

  const handleInsertToPaper = (imageUrl: string, caption: string) => {
    const md = `\n\n![${caption}](${imageUrl})\n\n`;
    navigator.clipboard.writeText(md).then(() => {
      alert("图片已复制到剪贴板！\n\n请在编辑器中 Ctrl+V 插入论文。");
    }).catch(() => {
      alert(`图片链接：${imageUrl}\n\n请手动插入论文。`);
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!registry) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        无法加载图形注册表，请检查服务是否正常启动。
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <header className="h-14 border-b flex items-center px-4 gap-3 shrink-0 bg-card">
        <Button variant="ghost" size="icon" onClick={() => router.push("/projects")} title="返回项目列表">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="font-bold text-sm">科学绘图</span>

        {/* Category tabs */}
        <div className="flex-1 flex justify-center">
          <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "ghost"}
                size="sm" className="h-7 text-xs"
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Body: left type list + right content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: figure type list */}
        <aside className="w-52 border-r bg-card overflow-y-auto shrink-0 p-3 space-y-1">
          {categoryFigures.map(fig => (
            <button
              key={fig.id}
              onClick={() => setSelectedFigure(fig)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                selectedFigure?.id === fig.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "hover:bg-muted"
              }`}
            >
              <div className="font-medium text-xs">{fig.name}</div>
              <div className={`text-[10px] leading-tight mt-0.5 ${
                selectedFigure?.id === fig.id ? "text-primary-foreground/70" : "text-muted-foreground"
              }`}>
                {fig.description}
              </div>
            </button>
          ))}
        </aside>

        {/* Right: content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto p-6">
            {selectedFigure?.category === "chart" && (
              <ChartPanel
                key={selectedFigure.id}
                projectId={projectId}
                onInsertToPaper={handleInsertToPaper}
                registryEntry={selectedFigure}
              />
            )}
            {selectedFigure?.category === "table" && (
              <TablePanel />
            )}
            {selectedFigure && selectedFigure.category !== "chart" && selectedFigure.category !== "table" && (
              <div className="text-center text-muted-foreground py-20">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">{selectedFigure.name} 模块已就绪</p>
                <p className="text-xs mt-1">
                  此图形类型通过现有入口使用：
                  <code className="bg-muted px-1 rounded ml-1 text-[11px]">{selectedFigure.endpoint}</code>
                </p>
                <Button variant="outline" size="sm" className="mt-4 text-xs"
                  onClick={() => router.push(`/workbench?id=${projectId}`)}>
                  前往工作台使用
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function PlotPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">正在加载...</div>}>
      <PlotContent />
    </Suspense>
  );
}
