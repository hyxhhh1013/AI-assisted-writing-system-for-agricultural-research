"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, LayoutDashboard, Search, Shuffle, ClipboardCheck, Clock, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import { usePlagiarismCheck } from "@/hooks/use-plagiarism-check";
import { getProject, listProjects } from "@/services/project";
import { getHistory as getReviewHistory } from "@/services/review";
import type { ReviewHistoryItem } from "@/contracts/review";
import { useGoBack } from "@/contexts/navigation-history";
import { workbenchFallback } from "@/lib/navigation";
import {
  buildQualitySections,
  buildCheckContentFromSections,
  type QualitySection,
} from "@/lib/quality-sections";
import { getProjectWritingMode } from "@/lib/section-registry";
import { PlagiarismCheckForm } from "@/components/shared/plagiarism/check-form";
import { PlagiarismResultView } from "@/components/shared/plagiarism/result-view";
import { PlagiarismRewriteView } from "@/components/shared/plagiarism/rewrite-view";
import { ReviewTab } from "@/components/shared/review-tab";
import { OverviewPanel, type QualityTab } from "@/components/shared/quality/overview-panel";
import { SectionSidebar } from "@/components/shared/quality/section-sidebar";
import { DetectionScopePanel } from "@/components/shared/quality/detection-scope";
import { UnifiedHistoryPanel } from "@/components/shared/quality/unified-history-panel";
import { persistQualitySections } from "@/lib/quality-persist";

const TAB_DEFS: { id: QualityTab; label: string; icon: typeof Search; requiresResult?: boolean }[] = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "check", label: "查重", icon: Search },
  { id: "result", label: "报告", icon: Search, requiresResult: true },
  { id: "rewrite", label: "降重", icon: Shuffle, requiresResult: true },
  { id: "review", label: "审查", icon: ClipboardCheck },
  { id: "history", label: "历史", icon: Clock },
];

function parseTab(raw: string | null): QualityTab {
  if (raw === "check" || raw === "result" || raw === "rewrite" || raw === "review" || raw === "history") return raw;
  return "overview";
}

export function QualityWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pid = searchParams.get("id");
  const goBack = useGoBack();

  const [tab, setTabState] = useState<QualityTab>(() => parseTab(searchParams.get("tab")));
  const [project, setProject] = useState<ProjectData | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [web, setWeb] = useState(false);
  const [scope, setScope] = useState<"full" | string>("full");
  const [plist, setPlist] = useState<{ id: string; title: string }[]>([]);
  const [selPid, setSelPid] = useState(pid || "");
  const [loadingP, setLoadingP] = useState(false);
  const [lastReview, setLastReview] = useState<ReviewHistoryItem | null>(null);
  const [historyResult, setHistoryResult] = useState<PlagiarismCheckResult | null>(null);

  const {
    result: checkResult,
    checking,
    stage,
    error,
    check: doPlagiarismCheck,
    cancel,
    reset: resetPlagiarism,
  } = usePlagiarismCheck();

  const result = checkResult ?? historyResult;
  const activeProjectId = selPid || pid || undefined;

  const sections = useMemo<QualitySection[]>(
    () => (project ? buildQualitySections(project) : []),
    [project],
  );

  const lastToastCheckIdRef = useRef<string | null>(null);

  const setTab = useCallback((next: QualityTab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (activeProjectId) params.set("id", activeProjectId);
    params.set("tab", next);
    router.replace(`/plagiarism?${params.toString()}`, { scroll: false });
  }, [activeProjectId, router, searchParams]);

  useEffect(() => {
    setTabState(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    listProjects().then((d) => { if (Array.isArray(d)) setPlist(d); }).catch(() => {});
  }, []);

  const applyProject = useCallback((d: ProjectData, projectId: string) => {
    setProject(d);
    setTitle(d.title || "");
    setSelPid(projectId);
    const secs = buildQualitySections(d);
    setScope("full");
    setContent(buildCheckContentFromSections(secs, "full"));
  }, []);

  useEffect(() => {
    if (!pid) return;
    projectStore.get(pid).then((d) => {
      if (d) applyProject(d, pid);
    }).catch(() => {});
  }, [pid, applyProject]);

  useEffect(() => {
    if (!activeProjectId) {
      setLastReview(null);
      return;
    }
    getReviewHistory(activeProjectId)
      .then((rows) => setLastReview(rows[0] ?? null))
      .catch(() => setLastReview(null));
  }, [activeProjectId, tab]);

  useEffect(() => {
    if (sections.length === 0) return;
    setContent(buildCheckContentFromSections(sections, scope));
  }, [scope, sections]);

  useEffect(() => {
    if (checking || !checkResult?.checkId) return;
    if (lastToastCheckIdRef.current === checkResult.checkId) return;

    lastToastCheckIdRef.current = checkResult.checkId;
    setHistoryResult(null);
    setTabState("result");
    const params = new URLSearchParams(searchParams.toString());
    if (activeProjectId) params.set("id", activeProjectId);
    params.set("tab", "result");
    router.replace(`/plagiarism?${params.toString()}`, { scroll: false });
    toast.success(`检测完成，${checkResult.totalMatches} 处匹配`);
  }, [checkResult, checking, activeProjectId, router, searchParams]);

  const resetCheckSession = useCallback(() => {
    lastToastCheckIdRef.current = null;
    resetPlagiarism();
  }, [resetPlagiarism]);

  const loadP = async (id: string) => {
    if (!id) return;
    setLoadingP(true);
    try {
      const d = await getProject(id);
      if (!d) throw new Error("加载失败");
      applyProject(d, id);
      resetCheckSession();
      setHistoryResult(null);
      setTab("overview");
      const params = new URLSearchParams(searchParams.toString());
      params.set("id", id);
      params.set("tab", "overview");
      router.replace(`/plagiarism?${params.toString()}`, { scroll: false });
      toast.success(`已加载「${d.title}」`);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoadingP(false);
    }
  };

  const doCheck = async () => {
    if (!content.trim()) {
      toast.error("请输入内容");
      return;
    }
    await doPlagiarismCheck({
      projectId: activeProjectId,
      title: title || "未命名",
      content,
      webSearch: web,
    });
  };

  const handleSaveToProject = useCallback(async (updated: QualitySection[], changedKeys: string[]) => {
    if (!activeProjectId) return;
    await persistQualitySections(activeProjectId, sections, updated, changedKeys);
    const d = await getProject(activeProjectId);
    if (d) applyProject(d, activeProjectId);
    toast.success(`已写回 ${changedKeys.length} 个章节到项目`);
  }, [activeProjectId, sections, applyProject]);

  const handleAppliedRewrite = (newContent: string) => {
    setContent(newContent);
    resetCheckSession();
    setHistoryResult(null);
    setTab("check");
    toast.success("已应用改写，请重新查重验证");
  };

  const focusProjectPicker = () => setTab("check");

  const reviewSections = useMemo(
    () => sections.map((s) => ({ key: s.key, title: s.title, content: s.content })),
    [sections],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f6f5f1]">
      <header className="z-10 shrink-0 border-b border-[#1a5632]/10 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
            onClick={() => goBack(workbenchFallback(pid))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-[#122820]">论文质量中心</h1>
            <p className="truncate text-[10px] text-[#9aa8a0]">
              {project?.title ? project.title : "查重 · 降重 · 审查"}
            </p>
          </div>
          {loadingP && <Loader2 className="h-4 w-4 animate-spin text-[#1a5632]" />}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col px-4 py-3 sm:px-6 sm:py-4">
        <div className="mb-3 flex shrink-0 gap-1 overflow-x-auto rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-[#1a5632]/8">
          {TAB_DEFS.map((t) => {
            const disabled = t.requiresResult && !result;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                className={cn(
                  "flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-all",
                  tab === t.id ? "bg-[#1a5632] text-white shadow-sm" : disabled ? "cursor-not-allowed text-muted-foreground/40" : "text-[#3d4f46] hover:bg-[#1a5632]/8",
                )}
                onClick={() => !disabled && setTab(t.id)}
              >
                <t.icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#1a5632]/10 bg-white shadow-sm">
          {(tab === "check" || tab === "result" || tab === "rewrite") && sections.length > 0 && (
            <SectionSidebar sections={sections} activeScope={scope} onSelectScope={setScope} />
          )}

          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {tab === "overview" && (
              <OverviewPanel
                projectTitle={project?.title}
                hasProject={!!project}
                sections={sections}
                checkResult={result}
                lastReview={lastReview}
                webSearch={web}
                onNavigate={setTab}
                onSelectProject={focusProjectPicker}
              />
            )}

            {tab === "check" && (
              <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
                <PlagiarismCheckForm
                  title={title}
                  setTitle={setTitle}
                  content={content}
                  setContent={setContent}
                  webSearch={web}
                  setWebSearch={setWeb}
                  checking={checking}
                  stage={stage}
                  error={error}
                  onCheck={doCheck}
                  onCancel={cancel}
                  onClear={() => {
                    setContent(sections.length ? buildCheckContentFromSections(sections, scope) : "");
                    resetCheckSession();
                    setHistoryResult(null);
                  }}
                  plist={plist}
                  selPid={selPid}
                  loadingP={loadingP}
                  onLoadProject={loadP}
                />
                <DetectionScopePanel webSearch={web} compact />
              </div>
            )}

            {tab === "result" && result && (
              <div className="mx-auto max-w-4xl">
                <PlagiarismResultView
                  result={result}
                  sourceContent={content}
                  onRewrite={() => setTab("rewrite")}
                  onReCheck={() => setTab("check")}
                />
              </div>
            )}

            {tab === "rewrite" && result && (
              <div className="mx-auto max-w-4xl">
                <PlagiarismRewriteView
                  checkId={result.checkId}
                  matches={result.matches}
                  fullContent={content}
                  scope={scope}
                  qualitySections={sections.length > 0 ? sections : undefined}
                  onSaveToProject={activeProjectId ? handleSaveToProject : undefined}
                  onApplied={handleAppliedRewrite}
                />
              </div>
            )}

            {tab === "review" && (
              <div className="mx-auto max-w-4xl">
                {project && reviewSections.length > 0 ? (
                  <ReviewTab
                    title={project.title || "未命名论文"}
                    sections={reviewSections}
                    outline={project.outline}
                    references={project.references || []}
                    projectId={activeProjectId}
                    projectMode={getProjectWritingMode(project.mode)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ClipboardCheck className="mb-4 h-12 w-12 text-[#1a5632]/25" />
                    <p className="text-sm font-medium text-[#122820]">审查需要绑定项目章节</p>
                    <p className="mt-1 max-w-sm text-xs text-[#6b7c72]">
                      请先在查重页选择项目，系统会按 IMRAD / 综述结构加载各章正文后再执行四维度审查。
                    </p>
                    <Button className="mt-4 bg-[#1a5632] hover:bg-[#144a2a]" onClick={focusProjectPicker}>
                      选择项目
                    </Button>
                  </div>
                )}
              </div>
            )}

            {tab === "history" && (
              <div className="mx-auto max-w-3xl h-full min-h-[400px]">
                <UnifiedHistoryPanel
                  projectId={activeProjectId}
                  onViewPlagiarism={(r) => { setHistoryResult(r); setTab("result"); }}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
