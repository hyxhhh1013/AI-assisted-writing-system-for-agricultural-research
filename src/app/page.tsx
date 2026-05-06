"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BookOpen, FileText, BarChart3, Settings, Layout, Clock, ChevronRight, Search, LogOut, User, Loader2 } from "lucide-react";
import { projectStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [recentProjects, setRecentProjects] = useState<{ id: string; title: string; lastUpdated: number }[]>([]);

  useEffect(() => {
    if (user) {
      const fetchRecent = async () => {
        const list = await projectStore.list();
        setRecentProjects(list.slice(0, 3));
      };
      fetchRecent();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tools = [
    {
      title: "全能科研工作台",
      description: "集成式论文创作环境，支持数据分析、大纲生成、AI 扩写与实时预览",
      icon: <FileText className="w-6 h-6 text-primary" />,
      href: "/workbench",
    },
    {
      title: "项目管理中心",
      description: "管理多篇论文创作进度，支持多项目切换、归档与快速导出",
      icon: <Layout className="w-6 h-6 text-primary" />,
      href: "/projects",
    },
    {
      title: "文献库管理",
      description: "管理实验室私有文献，支持 PDF 查看与 AI 划词翻译",
      icon: <Settings className="w-6 h-6 text-primary" />,
      href: "/knowledge",
    },
    {
      title: "论文查重与降重",
      description: "检测论文重复率，AI 辅助降重改写，支持本地库 + 联网比对",
      icon: <Search className="w-6 h-6 text-primary" />,
      href: "/plagiarism",
    },
  ];

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl">
      {/* 顶部导航 */}
      <div className="flex justify-end items-center mb-8 gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              {user.name}
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
              <LogOut className="h-4 w-4" /> 退出
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="outline" size="sm">登录</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">注册</Button>
            </Link>
          </div>
        )}
      </div>

      <header className="mb-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          农业科研 AI 辅助写作系统
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          让 AI 懂农业，让科研更高效。基于实验室私有知识库的垂直领域写作助手。
        </p>
      </header>

      {recentProjects.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> 最近编辑的论文
            </h2>
            <Link href="/projects" className="text-sm text-primary hover:underline flex items-center">
              查看全部项目 <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentProjects.map((project) => (
              <Link key={project.id} href={`/workbench?id=${project.id}`}>
                <Card className="hover:border-primary/50 transition-colors group">
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm line-clamp-1 group-hover:text-primary transition-colors">
                      {project.title || "未命名论文"}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      上次编辑: {new Date(project.lastUpdated).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool) => (
          <Link href={tool.href} key={tool.title} className="block">
            <Card className="h-full hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer border-2 hover:border-primary/20 bg-card/50">
              <CardHeader>
                <div className="mb-4 p-3 bg-primary/5 rounded-xl w-fit">{tool.icon}</div>
                <CardTitle className="text-lg">{tool.title}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center font-semibold text-primary text-sm">
                  进入模块 <span className="ml-2">→</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <section className="mt-20 p-10 rounded-3xl bg-primary/5 border border-primary/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="max-w-3xl relative z-10">
          <h2 className="text-2xl font-bold mb-6">专业化与可定制性</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="mr-3 mt-1 bg-primary text-white rounded-full p-1 text-[10px]">✓</div>
                <div>
                  <h3 className="font-bold text-sm">多项目并行</h3>
                  <p className="text-xs text-muted-foreground">支持同时开展多篇论文撰写，互不干扰。</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="mr-3 mt-1 bg-primary text-white rounded-full p-1 text-[10px]">✓</div>
                <div>
                  <h3 className="font-bold text-sm">多格式预览</h3>
                  <p className="text-xs text-muted-foreground">内置 SCI、IEEE、GB/T 7713 等国内外主流期刊排版模板。</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="mr-3 mt-1 bg-primary text-white rounded-full p-1 text-[10px]">✓</div>
                <div>
                  <h3 className="font-bold text-sm">RAG 知识增强</h3>
                  <p className="text-xs text-muted-foreground">深度绑定实验室私有文献，确保生成的表达学术严谨。</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="mr-3 mt-1 bg-primary text-white rounded-full p-1 text-[10px]">✓</div>
                <div>
                  <h3 className="font-bold text-sm">数据驱动分析</h3>
                  <p className="text-xs text-muted-foreground">自动解析实验数据，生成符合论文规范的数据描述。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
