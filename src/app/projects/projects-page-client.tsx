"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Clock, MoreVertical, Layout, BookOpen, FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CreateProjectWizard } from "@/components/shared/create-project-wizard";
import { ProjectModeBadge } from "@/components/shared/project-mode-badge";
import { projectStore } from "@/lib/store";
import { siteTheme } from "@/lib/site-theme";
import { toast } from "sonner";
import type { ProjectWritingMode } from "@/contracts/writing-mode";
import type { ProjectListItem } from "@/services/project";
import { cn } from "@/lib/utils";
import { getModeAccent } from "@/lib/mode-theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ModeFilter = "all" | ProjectWritingMode;

export default function ProjectsPageClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");

  const fetchProjects = async () => {
    setIsLoading(true);
    const list = await projectStore.list();
    setProjects(list);
    setIsLoading(false);
  };

  useEffect(() => {
    void fetchProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    if (modeFilter === "all") return projects;
    return projects.filter((p) => p.mode === modeFilter);
  }, [projects, modeFilter]);

  const counts = useMemo(
    () => ({
      all: projects.length,
      review: projects.filter((p) => p.mode === "review").length,
      research: projects.filter((p) => p.mode === "research").length,
    }),
    [projects],
  );

  const handleCreated = (projectId: string) => {
    void fetchProjects();
    router.push(`/workbench?id=${projectId}`);
  };

  const handleOpen = (id: string) => {
    router.push(`/workbench?id=${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("确定要删除这个项目吗？所有保存的内容都将丢失。")) {
      const success = await projectStore.delete(id);
      if (success) {
        await fetchProjects();
        toast.success("项目已删除");
      } else {
        toast.error("删除失败");
      }
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filterButtons: { id: ModeFilter; label: string }[] = [
    { id: "all", label: `全部 (${counts.all})` },
    { id: "review", label: `综述 (${counts.review})` },
    { id: "research", label: `创新型 (${counts.research})` },
  ];

  return (
    <>
      <PageHeader
        title="项目中心"
        subtitle="管理论文项目；类型在创建时选定，此处通过标签与卡片样式区分"
        icon={Layout}
        actions={
          <Button onClick={() => setCreateOpen(true)} className={`gap-2 ${siteTheme.btnPrimary}`}>
            <Plus className="h-4 w-4" />
            新建论文项目
          </Button>
        }
      />

      {projects.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {filterButtons.map((btn) => (
            <Button
              key={btn.id}
              variant={modeFilter === btn.id ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 rounded-full text-xs",
                modeFilter === btn.id && btn.id === "review" && "bg-[#2563eb] hover:bg-[#1d4ed8]",
                modeFilter === btn.id && btn.id === "research" && "bg-[#1a5632] hover:bg-[#144a2a]",
              )}
              onClick={() => setModeFilter(btn.id)}
            >
              {btn.label}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="py-20 text-center text-sm text-[#6b7c72]">加载中...</div>
      ) : projects.length === 0 ? (
        <div
          className={`flex flex-col items-center gap-4 py-20 text-center ${siteTheme.card} border-dashed`}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1a5632]/8">
            <Layout className="h-8 w-8 text-[#1a5632]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#122820]">暂无论文项目</h3>
            <p className="mt-1 text-sm text-[#6b7c72]">
              创建时可选择「文献综述」或「研究论文（创新型）」。
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} variant="outline" className="mt-2 border-[#1a5632]/20">
            立即创建
          </Button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className={`py-16 text-center text-sm text-[#6b7c72] ${siteTheme.card}`}>
          该分类下暂无项目，试试切换筛选或新建项目。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProjects.map((project) => {
            const isResearch = project.mode === "research";
            const accent = getModeAccent(project.mode);
            const Icon = isResearch ? FlaskConical : BookOpen;
            return (
              <Card
                key={project.id}
                className={cn(
                  "group cursor-pointer border-l-4",
                  siteTheme.card,
                  siteTheme.cardHover,
                  accent.borderLeft,
                )}
                onClick={() => handleOpen(project.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                        accent.iconBg,
                        "group-hover:opacity-90",
                      )}
                    >
                      <Icon className={cn("h-5 w-5", accent.iconText)} />
                    </div>
                    <div className="flex items-center gap-1">
                      <ProjectModeBadge mode={project.mode} />
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                            />
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => handleDelete(e, project.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> 删除项目
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardTitle className="mt-4 line-clamp-2 text-base leading-snug text-[#122820]">
                    {project.title || "未命名论文项目"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
                      <div
                        className={cn("h-full rounded-full transition-all", accent.progress)}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-[#9aa8a0]">{project.progress}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#6b7c72]">
                    <Clock className="h-3 w-3" />
                    上次编辑: {formatDate(project.lastUpdated)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateProjectWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
