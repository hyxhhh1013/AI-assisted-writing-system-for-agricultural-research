"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewTab } from "@/components/shared/review-tab";
import { ReviewHistoryList } from "@/components/shared/review/review-history-list";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import { ArrowLeft, Loader2, History, Play } from "lucide-react";
import { toast } from "sonner";
import { useGoBack } from "@/contexts/navigation-history";
import { workbenchFallback } from "@/lib/navigation";

export function ReviewWorkspace() {
  const router = useRouter();
  const goBack = useGoBack();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"run" | "history">("run");

  useEffect(() => {
    if (!projectId) {
      router.replace("/projects");
      return;
    }

    projectStore.get(projectId).then((data) => {
      if (!data) {
        toast.error("未找到项目");
        router.replace("/projects");
        return;
      }
      setProject(data);
      setLoading(false);
    }).catch(() => {
      toast.error("加载项目失败");
      router.replace("/projects");
    });
  }, [projectId, router]);

  // 从 project 构建真实的 IMRAD sections
  const sections = useMemo(() => {
    if (!project) return [];
    const list: Array<{ key: string; title: string; content: string }> = [];

    if (project.abstract?.trim()) {
      list.push({ key: "abstract", title: "摘要", content: project.abstract });
    }
    const labels: Record<string, string> = {
      introduction: "引言",
      methods: "材料与方法",
      results: "结果与讨论",
      conclusion: "结论",
    };
    for (const [key, title] of Object.entries(labels)) {
      const content = project.sections?.[key];
      if (content?.trim()) {
        list.push({ key, title, content });
      }
    }

    return list;
  }, [project]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6f5f1]">
        <Loader2 className="h-6 w-6 animate-spin text-[#1a5632]/40" />
        <span className="ml-2 text-sm text-[#6b7c72]">加载项目...</span>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f6f5f1]">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-[#1a5632]/10 bg-[#f6f5f1]/85 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#3d4f46] hover:text-[#1a5632]"
              onClick={() => goBack(workbenchFallback(projectId))}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-[#122820] truncate">
                {project.title || "未命名论文"} · 论文审查
              </h1>
              <p className="text-[10px] text-[#9aa8a0]">
                {sections.length} 个章节可用
              </p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "run" | "history")}>
            <TabsList className="h-8">
              <TabsTrigger value="run" className="text-xs gap-1.5 h-7">
                <Play className="h-3.5 w-3.5" />
                执行审查
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5 h-7">
                <History className="h-3.5 w-3.5" />
                历史记录
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* 主体 */}
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            {tab === "run" ? (
              <ReviewTab
                title={project.title || "未命名论文"}
                sections={sections}
                outline={project.outline}
                references={project.references || []}
                projectId={projectId ?? undefined}
              />
            ) : (
              <div className="rounded-2xl border border-[#1a5632]/10 bg-white overflow-hidden">
                <ReviewHistoryList projectId={projectId} />
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
