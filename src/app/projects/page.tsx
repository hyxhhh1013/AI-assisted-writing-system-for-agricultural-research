"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, FileText, Trash2, Clock, MoreVertical, Layout } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { projectStore } from "@/lib/store";
import { siteTheme } from "@/lib/site-theme";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<{ id: string; title: string; lastUpdated: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    setIsLoading(true);
    const list = await projectStore.list();
    setProjects(list);
    setIsLoading(false);
  };

  useEffect(() => {
    void fetchProjects();
  }, []);

  const handleCreate = async () => {
    const newProject = await projectStore.create();
    if (newProject) {
      router.push(`/workbench?id=${newProject.id}`);
    }
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

  return (
    <>
      <PageHeader
        title="项目中心"
        subtitle="管理论文项目，继续写作或新建课题"
        icon={Layout}
        actions={
          <Button onClick={handleCreate} className={`gap-2 ${siteTheme.btnPrimary}`}>
            <Plus className="h-4 w-4" />
            新建论文项目
          </Button>
        }
      />

      {isLoading ? (
        <div className="py-20 text-center text-sm text-[#6b7c72]">加载中...</div>
      ) : projects.length === 0 ? (
        <div
          className={`flex flex-col items-center gap-4 py-20 text-center ${siteTheme.card} border-dashed`}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1a5632]/8">
            <FileText className="h-8 w-8 text-[#1a5632]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#122820]">暂无论文项目</h3>
            <p className="mt-1 text-sm text-[#6b7c72]">
              点击上方按钮，开始您的第一篇 AI 辅助论文创作。
            </p>
          </div>
          <Button onClick={handleCreate} variant="outline" className="mt-2 border-[#1a5632]/20">
            立即创建
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className={`group cursor-pointer ${siteTheme.card} ${siteTheme.cardHover} hover:border-[#1a5632]/25`}
              onClick={() => handleOpen(project.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a5632]/10 transition-colors group-hover:bg-[#1a5632]/15">
                    <FileText className="h-5 w-5 text-[#1a5632]" />
                  </div>
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
                <CardTitle className="mt-4 line-clamp-2 text-base leading-snug text-[#122820]">
                  {project.title || "未命名论文项目"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-[#6b7c72]">
                  <Clock className="h-3 w-3" />
                  上次编辑: {formatDate(project.lastUpdated)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
