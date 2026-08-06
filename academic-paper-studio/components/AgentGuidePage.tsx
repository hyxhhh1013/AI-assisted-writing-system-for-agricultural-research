"use client";

import { useEffect, useMemo, useState } from "react";
import { listProjects, type ProjectListItem } from "@/services/project";
import { useAuth } from "@/lib/auth-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siteShellClass, siteTheme } from "@/lib/site-theme";
import { LabBackground } from "@/components/layout/lab-background";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import {
  Bot,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  ListChecks,
} from "lucide-react";

const AGENT_PUBLIC = process.env.NEXT_PUBLIC_AGENT_ENABLED === "1";
const PAGE_SIZE = 8;

const PHASE_CHEATSHEET = [
  { id: 0, title: "配置", tip: "题目、类型、字数、引用格式" },
  { id: 1, title: "文献", tip: "检索导入，或边写边检索" },
  { id: 2, title: "结构", tip: "大纲与章节骨架" },
  { id: 3, title: "论证", tip: "主张—证据链（Wave 3）" },
  { id: 4, title: "起草", tip: "按节扩写，引用受控" },
  { id: 5, title: "引用+摘要", tip: "核对 [n]；再写摘要" },
  { id: 6, title: "审查", tip: "查重 / 四维审查" },
  { id: 7, title: "导出", tip: "Word / Markdown / PDF" },
] as const;

/**
 * Agent 引导页（原「学术论文工作坊」看板已降级）。
 * 唯一去向：工作台 Agent Tab（人控仍走工作台其它 Tab）。
 */
export function AgentGuidePage() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [query]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const needLogin = !authLoading && !user && projects.length === 0 && !loading;

  const agentHref = selected
    ? `/workbench?id=${encodeURIComponent(selected.id)}&tab=agent`
    : null;
  const writingHref = selected
    ? `/workbench?id=${encodeURIComponent(selected.id)}&tab=writing`
    : null;
  const workbenchHref = selected
    ? `/workbench?id=${encodeURIComponent(selected.id)}`
    : "/projects";

  return (
    <div className={siteShellClass}>
      <LabBackground />
      <main className="relative mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        <PageHeader
          title="写作 Agent 引导"
          subtitle="选一篇论文项目，进入工作台 Agent Tab——不是第二套流水线看板"
          icon={GraduationCap}
          backHref="/"
        />

        <section className="relative overflow-hidden rounded-3xl border border-[#1a5632]/12 bg-gradient-to-br from-[#faf9f6] via-white to-[#e8f0ea] px-6 py-10 sm:px-10">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-[#1a5632]">
            <Bot className="h-4 w-4" />
            禾书耕文 · 自主写作入口
          </p>
          <h1 className="text-2xl font-bold leading-tight text-[#122820] sm:text-3xl">
            用写作 Agent 写进你的项目
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#3d4f46]">
            通用 Chat 能「生成一段话」；这里的 Agent 会绑定当前项目、检索实验室文献、把正文写进工作台章节，并尽量控制引用编号。
            八阶段流程由 <strong>PaperPassport + Agent 策略</strong> 管，不在本页造假进度条。
          </p>
          <ul className="mt-5 space-y-2 text-sm text-[#3d4f46]">
            <li className="flex gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1a5632]" />
              主战场：工作台 <strong>Agent Tab</strong>
            </li>
            <li className="flex gap-2">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#1a5632]" />
              文献：可先检索导入，也可在 Agent / 扩写里边写边检索
            </li>
            <li className="flex gap-2">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-[#1a5632]" />
              想自己点按钮：用工作台其它 Tab（提纲 / 章节协作 / 查重）
            </li>
          </ul>
        </section>

        <section className={cn(siteTheme.card, "mt-6 space-y-4 p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#122820]">1. 选择论文项目</h2>
            {filtered.length > 0 ? (
              <span className="text-[11px] text-[#9aa8a0]">
                共 {filtered.length} 篇 · 第 {safePage + 1}/{pageCount} 页
              </span>
            ) : null}
          </div>

          {needLogin ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              请先登录。
              <a href="/login" className="ml-2 font-medium text-[#1a5632] underline underline-offset-2">
                去登录
              </a>
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-[#6b7c72]">加载项目中…</p>
          ) : projects.length === 0 ? (
            <div className="space-y-2 text-sm text-[#3d4f46]">
              <p>还没有项目。先新建一篇，再回来打开 Agent。</p>
              <a href="/projects" className={cn(buttonVariants({ size: "sm" }), siteTheme.btnPrimary)}>
                去项目管理新建
              </a>
            </div>
          ) : (
            <>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索项目标题…"
                className="h-9"
              />
              {pageItems.length === 0 ? (
                <p className="text-sm text-[#6b7c72]">没有匹配的项目</p>
              ) : (
                <ul className="space-y-1">
                  {pageItems.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition",
                          selectedId === p.id
                            ? "border-[#1a5632]/40 bg-[#1a5632]/8 font-medium text-[#1a5632]"
                            : "border-transparent text-[#122820] hover:bg-[#1a5632]/5",
                        )}
                      >
                        {p.title}
                        <span className="mt-0.5 block text-[11px] font-normal text-[#9aa8a0]">
                          进度 {p.progress}% · {p.mode === "research" ? "研究" : "综述"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pageCount > 1 ? (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={safePage <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    上一页
                  </Button>
                  <span className="text-xs text-[#6b7c72]">
                    {safePage + 1} / {pageCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    下一页
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className={cn(siteTheme.card, "mt-4 space-y-3 p-5")}>
          <h2 className="text-sm font-semibold text-[#122820]">2. 进入 Agent</h2>

          {!AGENT_PUBLIC ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
              当前未开启 <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_AGENT_ENABLED=1</code>
              （服务端还需 <code className="rounded bg-white/80 px-1">AGENT_ENABLED=1</code>；写入另需{" "}
              <code className="rounded bg-white/80 px-1">AGENT_WRITE_ENABLED=1</code> 与{" "}
              <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_AGENT_WRITE_ENABLED=1</code>）。
              可先用人控「章节协作」扩写，开旗后再用 Agent Tab。
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {AGENT_PUBLIC && agentHref ? (
              <a href={agentHref} className={cn(buttonVariants({ size: "lg" }), siteTheme.btnPrimary)}>
                打开 Agent Tab
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            ) : null}
            {writingHref ? (
              <a
                href={writingHref}
                className={cn(
                  buttonVariants({ size: "lg", variant: AGENT_PUBLIC ? "outline" : "default" }),
                  !AGENT_PUBLIC && siteTheme.btnPrimary,
                )}
              >
                {AGENT_PUBLIC ? "或用人控扩写" : "打开章节协作（人控）"}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            ) : null}
            <a href={workbenchHref} className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}>
              打开工作台总览
            </a>
          </div>

          {selected ? (
            <p className="text-xs text-[#6b7c72]">
              将打开：<span className="font-medium text-[#122820]">{selected.title}</span>
            </p>
          ) : (
            <p className="text-xs text-[#9aa8a0]">请先选择或新建项目</p>
          )}
        </section>

        <details className="mt-6 rounded-2xl border border-[#1a5632]/10 bg-white/80 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[#122820]">
            八阶段速查（给 Agent / Cockpit 用，本页不造进度）
          </summary>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {PHASE_CHEATSHEET.map((p) => (
              <li
                key={p.id}
                className="rounded-lg bg-[#1a5632]/[0.04] px-3 py-2 text-xs text-[#3d4f46]"
              >
                <span className="font-medium text-[#1a5632]">
                  {p.id}. {p.title}
                </span>
                <span className="mt-0.5 block">{p.tip}</span>
              </li>
            ))}
          </ol>
        </details>

        <p className="mt-6 text-center text-xs text-[#9aa8a0]">
          规划见 <code className="text-[#6b7c72]">docs/MASTER_PLAN.md</code> · Wave 2 写作 Agent 产品化
        </p>
      </main>
    </div>
  );
}
