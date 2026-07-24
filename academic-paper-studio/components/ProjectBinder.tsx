"use client";

import { useEffect, useState } from "react";
import type { StudioController } from "../hooks/use-studio-session";
import { listProjects, type ProjectListItem } from "@/services/project";
import { useAuth } from "@/lib/auth-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { FolderOpen, Link2, Unlink, ExternalLink } from "lucide-react";

interface ProjectBinderProps {
  studio: StudioController;
  compact?: boolean;
  /** 有项目列表且尚未关联时，自动选最近一个 */
  autoLink?: boolean;
}

export function ProjectBinder({ studio, compact, autoLink = true }: ProjectBinderProps) {
  const { session, setLinkedProject } = studio;
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        setLoadError(null);
        setLoading(false);
        if (autoLink && !studio.session.linkedProject && list.length > 0) {
          const first = list[0];
          setLinkedProject({ id: first.id, title: first.title });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setLoadError("无法读取项目列表");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // 只在挂载时拉一次；关联状态由用户操作改变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linked = session.linkedProject;
  const needLogin = !authLoading && !user && projects.length === 0 && !loading;

  if (compact && linked) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1a5632]/15 bg-white/80 px-3 py-2 text-sm text-[#3d4f46]">
        <FolderOpen className="h-4 w-4 text-[#1a5632]" />
        <span>
          项目：<span className="font-medium text-[#122820]">{linked.title}</span>
        </span>
        <a
          href={`/workbench?id=${encodeURIComponent(linked.id)}`}
          className="inline-flex items-center gap-1 text-[#1a5632] underline-offset-2 hover:underline"
        >
          打开工作台
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOpen(true)}>
          更换
        </Button>
        {open ? (
          <ProjectPicker
            projects={projects}
            loading={loading}
            currentId={linked.id}
            onPick={(p) => {
              setLinkedProject(p);
              setOpen(false);
            }}
            onClear={() => {
              setLinkedProject(null);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn(siteTheme.card, "p-4")}>
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1a5632]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#122820]">关联论文项目（必做）</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#6b7c72]">
            不关联项目时，写作 / 文献 / 绘图按钮都无法打开真实工具。
          </p>

          {needLogin || loadError ? (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {loadError ?? "请先登录后再关联项目。"}
              <a
                href="/login"
                className="ml-2 font-medium text-[#1a5632] underline underline-offset-2"
              >
                去登录
              </a>
            </div>
          ) : null}

          {linked ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-[#1a5632]/8 px-3 py-1.5 text-sm font-medium text-[#1a5632]">
                {linked.title}
              </span>
              <a
                href={`/workbench?id=${encodeURIComponent(linked.id)}`}
                className={cn(buttonVariants({ size: "sm" }), siteTheme.btnPrimary)}
              >
                打开工作台
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-[#6b7c72]"
                onClick={() => setLinkedProject(null)}
              >
                <Unlink className="h-3.5 w-3.5" />
                取消关联
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
                更换项目
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className={siteTheme.btnPrimary}
                size="sm"
                onClick={() => setOpen(true)}
                disabled={loading || projects.length === 0}
              >
                {loading ? "加载项目中…" : "选择已有项目"}
              </Button>
              <a
                href="/projects"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                去新建项目
              </a>
            </div>
          )}

          {!loading && !needLogin && projects.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              还没有项目。请先新建一篇论文项目，再回到这里关联。
            </p>
          ) : null}

          {open ? (
            <ProjectPicker
              projects={projects}
              loading={loading}
              currentId={linked?.id ?? null}
              onPick={(p) => {
                setLinkedProject(p);
                setOpen(false);
              }}
              onClear={() => {
                setLinkedProject(null);
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProjectPicker({
  projects,
  loading,
  currentId,
  onPick,
  onClear,
  onClose,
}: {
  projects: ProjectListItem[];
  loading: boolean;
  currentId: string | null;
  onPick: (p: { id: string; title: string }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 w-full rounded-xl border border-[#1a5632]/15 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[#6b7c72]">选择项目</span>
        <button type="button" className="text-xs text-[#9aa8a0]" onClick={onClose}>
          收起
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-[#9aa8a0]">加载中…</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick({ id: p.id, title: p.title })}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                  currentId === p.id
                    ? "bg-[#1a5632]/10 font-medium text-[#1a5632]"
                    : "text-[#122820] hover:bg-[#1a5632]/5",
                )}
              >
                {p.title}
                <span className="mt-0.5 block text-[11px] text-[#9aa8a0]">
                  进度 {p.progress}% · {p.mode === "research" ? "研究" : "综述"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {currentId ? (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onClear}>
          清除关联
        </Button>
      ) : null}
    </div>
  );
}
