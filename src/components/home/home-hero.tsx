"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  Database,
  FileText,
  FolderPlus,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { searchKnowledge } from "@/services/knowledge";
import type { ProjectListItem } from "@/services/project";
import { CreateProjectWizard } from "@/components/shared/create-project-wizard";
import { ProjectModeBadge } from "@/components/shared/project-mode-badge";
import { cn } from "@/lib/utils";

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

function getProjectStatus(progress: number): { label: string; color: string; bg: string } {
  if (progress === 0) return { label: "草稿", color: "text-[#6b7c72]", bg: "bg-[#6b7c72]/8" };
  if (progress < 50) return { label: "写作中", color: "text-blue-600", bg: "bg-blue-50" };
  if (progress < 90) return { label: "修改中", color: "text-amber-600", bg: "bg-amber-50" };
  return { label: "已完成", color: "text-[#1a5632]", bg: "bg-[#1a5632]/8" };
}

interface HomeHeroProps {
  projects: ProjectListItem[];
}

interface KnowledgeStats {
  total: number;
  categories: number;
}

const QUICK_LINKS = [
  { href: "/knowledge", label: "知识库", icon: Database },
  { href: "/plot", label: "数据绘图", icon: BarChart3 },
  { href: "/guide", label: "使用指南", icon: BookOpen },
] as const;

export function HomeHero({ projects }: HomeHeroProps) {
  const router = useRouter();
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const recentProject = projects[0] ?? null;
  const [relativeReady, setRelativeReady] = useState(false);
  useEffect(() => {
    setRelativeReady(true);
  }, []);
  const otherProjects = projects.slice(1, 5);
  const projectCount = projects.length;
  const lastActivity =
    recentProject && relativeReady ? formatRelativeTime(recentProject.lastUpdated) : null;

  useEffect(() => {
    let cancelled = false;
    void searchKnowledge({ pageSize: 1, page: 1 })
      .then((res) => {
        if (cancelled) return;
        const cats = (res.categories || []).filter((c) => c && c !== "全部");
        setStats({ total: res.total ?? 0, categories: cats.length });
      })
      .catch(() => {
        if (!cancelled) setStats({ total: 0, categories: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreated = (projectId: string) => {
    setCreateOpen(false);
    router.push(`/workbench?id=${projectId}`);
  };

  return (
    <section className="relative">
      <div className="mb-8 space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#1a5632]/60">
          Agricultural AI Writing
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold leading-[1.15] tracking-tight text-[#122820] sm:text-4xl">
          {recentProject ? "回到你的论文工作台" : "在实验室文献库里，把论文写得更稳"}
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-[#5c6b63]">
          私有 RAG · 引用核实 · GB/T 7713 与 SCI 双轨排版，专为农业科研写作设计。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-[#1a5632]/12 bg-white p-6 sm:p-7",
            "shadow-[0_1px_0_rgba(26,86,50,0.04),0_12px_40px_-20px_rgba(26,86,50,0.18)]",
          )}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#1a5632]/[0.04]" />

          {recentProject ? (
            <div className="relative space-y-5">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-12 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#1a5632] to-[#2d7a4f]" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-[#1a5632]">最近编辑</p>
                    <ProjectModeBadge mode={recentProject.mode} />
                    {(() => {
                      const status = getProjectStatus(recentProject.progress);
                      return (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.color} ${status.bg}`}>
                          {status.label} {recentProject.progress}%
                        </span>
                      );
                    })()}
                  </div>
                  <p className="truncate text-xl font-semibold text-[#122820]">
                    {recentProject.title || "未命名论文"}
                  </p>
                  <p className="text-sm text-[#6b7c72]">
                    {lastActivity}
                    {projectCount > 1 ? ` · ${projectCount} 个项目进行中` : ""}
                  </p>
                  {/* 进度条 */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-1.5 flex-1 max-w-[200px] rounded-full bg-[#1a5632]/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#1a5632] to-[#2d7a4f] transition-all duration-500"
                        style={{ width: `${recentProject.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#9aa8a0] tabular-nums">
                      {recentProject.filledCount}/{recentProject.sectionCount} 章节
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <Link
                  href={`/workbench?id=${recentProject.id}`}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-10 rounded-full bg-[#1a5632] px-5 text-white shadow-sm shadow-[#1a5632]/25 hover:bg-[#144a2a]",
                  )}
                >
                  继续写作
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 rounded-full border-[#1a5632]/20 bg-transparent text-[#1a5632] hover:bg-[#1a5632]/5"
                  onClick={() => setCreateOpen(true)}
                >
                  <FolderPlus className="mr-1.5 h-4 w-4" />
                  新建
                </Button>
                {projectCount > 1 && (
                  <Link
                    href="/projects"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "lg" }),
                      "h-10 rounded-full text-[#5c6b63]",
                    )}
                  >
                    全部项目
                    <ChevronRight className="ml-0.5 h-4 w-4" />
                  </Link>
                )}
              </div>

              {otherProjects.length > 0 && (
                <div className="border-t border-[#1a5632]/8 pt-4">
                  <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#1a5632]/50">
                    其他项目
                  </p>
                  <ul className="space-y-1">
                    {otherProjects.map((project) => {
                      const status = getProjectStatus(project.progress);
                      return (
                        <li key={project.id}>
                          <Link
                            href={`/workbench?id=${project.id}`}
                            className="group flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-[#1a5632]/5"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-[#1a5632]/40 group-hover:text-[#1a5632]" />
                            <span className="min-w-0 flex-1 truncate text-sm text-[#3d4f46] group-hover:text-[#122820]">
                              {project.title || "未命名论文"}
                            </span>
                            <ProjectModeBadge mode={project.mode} />
                            {/* 进度条 */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 w-16 rounded-full bg-[#1a5632]/8 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#1a5632] to-[#2d7a4f] transition-all duration-500"
                                    style={{ width: `${project.progress}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-[#9aa8a0] tabular-nums">
                                  {project.filledCount}/{project.sectionCount}
                                </span>
                              </div>
                              {/* 状态标签 */}
                              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.color} ${status.bg}`}>
                                {status.label}
                              </span>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#1a5632]/20 transition-transform group-hover:translate-x-0.5 group-hover:text-[#1a5632]" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="relative space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { step: "01", title: "选择类型", sub: "综述或创新型研究论文" },
                  { step: "02", title: "整理文献", sub: "上传 PDF 建立索引" },
                  { step: "03", title: "AI 扩写", sub: "大纲生成与章节写作" },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="rounded-xl border border-[#1a5632]/8 bg-[#f6f5f1]/80 px-4 py-3"
                  >
                    <span className="font-mono text-[11px] font-semibold text-[#1a5632]">
                      {item.step}
                    </span>
                    <p className="mt-1 text-sm font-semibold text-[#122820]">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[#6b7c72]">{item.sub}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2.5">
                <Button
                  size="lg"
                  className="h-10 rounded-full bg-[#1a5632] px-5 shadow-sm shadow-[#1a5632]/25 hover:bg-[#144a2a]"
                  onClick={() => setCreateOpen(true)}
                >
                  <FolderPlus className="mr-1.5 h-4 w-4" />
                  新建第一篇论文
                </Button>
                <Link
                  href="/guide"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-10 rounded-full border-[#1a5632]/20 text-[#1a5632] hover:bg-[#1a5632]/5",
                  )}
                >
                  阅读使用指南
                </Link>
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <div className="flex-1 rounded-2xl border border-[#1a5632]/10 bg-[#1a5632] p-5 text-white">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-200/70" />
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">
                Lab Overview
              </p>
            </div>
            <p className="mt-2 text-sm font-medium leading-snug text-white/90">实验室概览</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatTile
                icon={FileText}
                value={projectCount}
                label="论文项目"
              />
              <StatTile
                icon={Database}
                value={stats?.total}
                label="知识库文献"
              />
              <StatTile
                icon={Layers}
                value={stats?.categories}
                label="文献分类"
              />
              <StatTile
                value={lastActivity ?? "—"}
                label="最近活动"
                small
              />
            </div>

            <div className="mt-5 space-y-1.5 border-t border-white/10 pt-4">
              {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 text-xs transition-colors hover:bg-white/8"
                >
                  <span className="flex items-center gap-2 text-white/80 group-hover:text-white">
                    <Icon className="h-3.5 w-3.5 text-emerald-200/70" />
                    {label}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white/70" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <CreateProjectWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </section>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  small,
}: {
  icon?: typeof FileText;
  value: number | string | null | undefined;
  label: string;
  small?: boolean;
}) {
  const display =
    value === undefined || value === null
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString()
        : value;

  return (
    <div className="rounded-lg bg-white/[0.06] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-white/45">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <p
        className={cn(
          "mt-1 font-semibold text-white",
          small ? "text-xs leading-tight" : "text-lg leading-none",
        )}
      >
        {display}
      </p>
    </div>
  );
}
