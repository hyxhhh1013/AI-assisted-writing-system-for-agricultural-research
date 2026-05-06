"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, FileText, Trash2, Clock,
  ArrowLeft, Search, MoreVertical, Layout, User, LogOut
} from "lucide-react";
import { projectStore } from "@/lib/store";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";

export default function ProjectsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<{ id: string; title: string; lastUpdated: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    setIsLoading(true);
    const list = await projectStore.list();
    setProjects(list);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProjects();
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
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b h-16 flex items-center px-8 sticky top-0 z-10">
        <div className="flex items-center gap-4 max-w-7xl mx-auto w-full">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Layout className="h-5 w-5 text-primary" />
            项目中心
          </h1>
          <div className="flex-1" />
          {user && (
            <div className="flex items-center gap-3 mr-4">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {user.name}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新建论文项目
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8">
        {projects.length === 0 ? (
          <div className="text-center py-20 bg-background rounded-2xl border border-dashed flex flex-col items-center gap-4">
            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">暂无论文项目</h3>
              <p className="text-sm text-muted-foreground mt-1">
                点击上方按钮，开始您的第一篇 AI 辅助论文创作。
              </p>
            </div>
            <Button onClick={handleCreate} variant="outline" className="mt-2">
              立即创建
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((project) => (
              <Card 
                key={project.id} 
                className="group hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md"
                onClick={() => handleOpen(project.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger 
                        render={<Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        onClick={e => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleDelete(e, project.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> 删除项目
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle className="text-base line-clamp-2 mt-4 leading-snug">
                    {project.title || "未命名论文项目"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-xs text-muted-foreground gap-2">
                    <Clock className="h-3 w-3" />
                    上次编辑: {formatDate(project.lastUpdated)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
