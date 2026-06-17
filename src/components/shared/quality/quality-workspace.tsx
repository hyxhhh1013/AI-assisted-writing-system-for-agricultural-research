"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Search, Shuffle, ClipboardCheck, Clock, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import type { FixableReviewReport } from "@/types/review";
import { usePlagiarismCheck } from "@/hooks/use-plagiarism-check";
import { getProject, listProjects } from "@/services/project";
import { getHistory as getReviewHistory, getDetail as getReviewDetail } from "@/services/review";
import { listHistory, getCheckDetail } from "@/services/plagiarism";
import { buildFixableReportFromDetail, buildRestoredPlagiarismSession } from "@/lib/quality-restore";
import type { ReviewHistoryItem } from "@/contracts/review";
import { useGoBack } from "@/contexts/navigation-history";
import { workbenchFallback } from "@/lib/navigation";
import {
  buildQualitySections,
  buildCheckContentFromSections,
  type QualitySection,
} from "@/lib/quality-sections";
import { getProjectWritingMode } from "@/lib/section-registry";
import { riskBadgeClass, riskLabel } from "@/components/shared/plagiarism/constants";
import { PlagiarismCheckForm } from "@/components/shared/plagiarism/check-form";
import { PlagiarismResultView } from "@/components/shared/plagiarism/result-view";
import { PlagiarismRewriteView } from "@/components/shared/plagiarism/rewrite-view";
import { ReviewTab } from "@/components/shared/review-tab";
import { SectionSidebar } from "@/components/shared/quality/section-sidebar";
import { UnifiedHistoryPanel } from "@/components/shared/quality/unified-history-panel";
import { persistQualitySections } from "@/lib/quality-persist";
import { parseQualityTab, shouldOpenCheckResult, type QualityTab } from "@/components/shared/quality/types";

const TAB_DEFS: { id: QualityTab; label: string; icon: typeof Search; requiresResult?: boolean }[] = [
  { id: "check", label: "查重", icon: Search },
  { id: "rewrite", label: "降重", icon: Shuffle, requiresResult: true },
  { id: "review", label: "审查", icon: ClipboardCheck },
  { id: "history", label: "历史", icon: Clock },
];

type CheckView = "form" | "result";

export function QualityWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pid = searchParams.get("id");
  const goBack = useGoBack();

  const initialTab = parseQualityTab(searchParams.get("tab"));
  const [tab, setTabState] = useState<QualityTab>(initialTab);
  const [checkView, setCheckView] = useState<CheckView>(() =>
    shouldOpenCheckResult(searchParams.get("tab")) ? "result" : "form",
  );
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
  const [savedReviewReport, setSavedReviewReport] = useState<FixableReviewReport | null>(null);
  const [restoringSession, setRestoringSession] = useState(false);

  const {
    result: checkResult,
    checking,
    stage,
    error,
    check: doPlagiarismCheck,
    cancel,
    reset: resetPlagiarism,
    restoreResult,
  } = usePlagiarismCheck();

  const result = checkResult ?? historyResult;
  const activeProjectId = selPid || pid || undefined;

  const sections = useMemo<QualitySection[]>(
    () => (project ? buildQualitySections(project) : []),
    [project],
  );

  const lastToastCheckIdRef = useRef<string | null>(null);
  const sessionRestoredForRef = useRef<string | null>(null);

  const syncSessionParams = useCallback((patch: { tab?: QualityTab; checkId?: string; reviewId?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeProjectId) params.set("id", activeProjectId);
    if (patch.tab) params.set("tab", patch.tab);
    if (patch.checkId) params.set("checkId", patch.checkId);
    if (patch.reviewId) params.set("reviewId", patch.reviewId);
    router.replace(`/plagiarism?${params.toString()}`, { scroll: false });
  }, [activeProjectId, router, searchParams]);

  const setTab = useCallback((next: QualityTab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (activeProjectId) params.set("id", activeProjectId);
    params.set("tab", next);
    router.replace(`/plagiarism?${params.toString()}`, { scroll: false });
  }, [activeProjectId, router, searchParams]);

  useEffect(() => {
    const nextTab = parseQualityTab(searchParams.get("tab"));
    setTabState(nextTab);
    if (shouldOpenCheckResult(searchParams.get("tab")) && result) {
      setCheckView("result");
    }
  }, [searchParams, result]);

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
    if (restoringSession) return;
    if (checkResult && scope === "full") return;
    setContent(buildCheckContentFromSections(sections, scope));
  }, [scope, sections, restoringSession, checkResult]);

  /** 从 DB 恢复该项目最近一次查重 / 审查结果 */
  useEffect(() => {
    if (!activeProjectId || checking || checkResult) return;
    if (sessionRestoredForRef.current === activeProjectId) return;

    let cancelled = false;
    setRestoringSession(true);

    (async () => {
      try {
        const urlCheckId = searchParams.get("checkId");
        let checkId = urlCheckId;
        if (!checkId) {
          const rows = await listHistory({ projectId: activeProjectId, limit: 1 });
          const latest = rows[0];
          if (latest?.status === "completed" || latest?.maxSimilarity !== undefined) {
            checkId = latest.id;
          }
        }

        if (checkId && !cancelled) {
          const detail = await getCheckDetail(checkId);
          const session = buildRestoredPlagiarismSession(detail);
          restoreResult(session.result);
          lastToastCheckIdRef.current = session.result.checkId;
          setHistoryResult(null);
          if (session.content.trim()) {
            setContent(session.content);
            setTitle(session.title);
          }
          setCheckView("result");
          syncSessionParams({ checkId });
        }

        const urlReviewId = searchParams.get("reviewId");
        let reviewId = urlReviewId;
        if (!reviewId) {
          const rows = await getReviewHistory(activeProjectId);
          reviewId = rows[0]?.id;
        }
        if (reviewId && !cancelled) {
          const detail = await getReviewDetail(reviewId);
          if (!cancelled) {
            setSavedReviewReport(buildFixableReportFromDetail(detail));
            syncSessionParams({ reviewId });
          }
        }
      } catch {
        // 无历史记录时静默
      } finally {
        if (!cancelled) {
          sessionRestoredForRef.current = activeProjectId;
          setRestoringSession(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [activeProjectId, checking, checkResult, restoreResult, searchParams, syncSessionParams]);

  useEffect(() => {
    if (checking || !checkResult?.checkId) return;
    if (lastToastCheckIdRef.current === checkResult.checkId) return;

    lastToastCheckIdRef.current = checkResult.checkId;
    setHistoryResult(null);
    setSavedReviewReport(null);
    setTabState("check");
    setCheckView("result");
    syncSessionParams({ tab: "check", checkId: checkResult.checkId });
    toast.success(`检测完成，${checkResult.totalMatches} 处匹配`);
  }, [checkResult, checking, syncSessionParams]);

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
      sessionRestoredForRef.current = null;
      setSavedReviewReport(null);
      applyProject(d, id);
      resetCheckSession();
      setHistoryResult(null);
      setCheckView("form");
      setTab("check");
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
    setCheckView("form");
    setTab("check");
    toast.success("已应用改写，请重新查重验证");
  };

  const openCheckResult = () => {
    setTab("check");
    setCheckView("result");
  };

  const handleReportSaved = useCallback((reviewId: string) => {
    setSavedReviewReport(null);
    syncSessionParams({ reviewId });
    getReviewHistory(activeProjectId)
      .then((rows) => setLastReview(rows[0] ?? null))
      .catch(() => {});
  }, [activeProjectId, syncSessionParams]);

  const handleViewPlagiarismHistory = useCallback(async (r: PlagiarismCheckResult) => {
    try {
      const detail = await getCheckDetail(r.checkId);
      const session = buildRestoredPlagiarismSession(detail);
      restoreResult(session.result);
      lastToastCheckIdRef.current = r.checkId;
      setHistoryResult(null);
      if (session.content.trim()) {
        setContent(session.content);
        setTitle(session.title);
      }
    } catch {
      setHistoryResult(r);
    }
    setCheckView("result");
    setTab("check");
    syncSessionParams({ tab: "check", checkId: r.checkId });
  }, [restoreResult, setTab, syncSessionParams]);

  const reviewSections = useMemo(
    () => sections.map((s) => ({ key: s.key, title: s.title, content: s.content })),
    [sections],
  );

  const showSectionSidebar = sections.length > 0 && (tab === "check" || tab === "rewrite");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f6f5f1]">
      <header className="z-10 shrink-0 border-b border-[#1a5632]/10 bg-white/90 backdrop-blur-sm">
        <div className="flex h-14 w-full items-center gap-3 px-4 lg:px-8">
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
              {project?.title ?? "查重 · 降重 · 审查"}
              {sections.length > 0 && ` · ${sections.length} 章`}
            </p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {result && tab !== "check" && (
              <button
                type="button"
                onClick={openCheckResult}
                className="flex items-center gap-1.5 rounded-lg border border-[#1a5632]/15 bg-[#faf9f6] px-2.5 py-1 text-[10px] hover:bg-[#1a5632]/5"
              >
                <span className="font-semibold tabular-nums text-[#122820]">
                  {(result.maxSimilarity * 100).toFixed(1)}%
                </span>
                <Badge className={cn("h-4 px-1 text-[9px]", riskBadgeClass(result.overallRisk))}>
                  {riskLabel(result.overallRisk)}
                </Badge>
              </button>
            )}
            {lastReview && tab !== "review" && (
              <button
                type="button"
                onClick={() => setTab("review")}
                className="rounded-lg border border-[#1a5632]/15 bg-[#faf9f6] px-2.5 py-1 text-[10px] text-[#3d4f46] hover:bg-[#1a5632]/5"
              >
                审查 {lastReview.overallScore ?? "—"} 分
              </button>
            )}
          </div>
          {(loadingP || restoringSession) && <Loader2 className="h-4 w-4 animate-spin text-[#1a5632]" />}
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1 px-3 py-3 sm:px-4 lg:px-6 xl:px-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-3 flex shrink-0 gap-1 overflow-x-auto rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-[#1a5632]/8">
            {TAB_DEFS.map((t) => {
              const disabled = t.requiresResult && !result;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={disabled}
                  className={cn(
                    "flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-medium transition-all",
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
            {showSectionSidebar && (
              <SectionSidebar sections={sections} activeScope={scope} onSelectScope={setScope} />
            )}

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {tab === "check" && (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  {result && (
                    <div className="flex shrink-0 gap-1 rounded-lg bg-[#faf9f6] p-1">
                      <button
                        type="button"
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          checkView === "form" ? "bg-white text-[#122820] shadow-sm" : "text-[#6b7c72] hover:text-[#122820]",
                        )}
                        onClick={() => setCheckView("form")}
                      >
                        检测配置
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          checkView === "result" ? "bg-white text-[#122820] shadow-sm" : "text-[#6b7c72] hover:text-[#122820]",
                        )}
                        onClick={() => setCheckView("result")}
                      >
                        查重报告
                        {result.totalMatches > 0 && (
                          <span className="ml-1 tabular-nums text-[#1a5632]">{result.totalMatches}</span>
                        )}
                      </button>
                    </div>
                  )}

                  {checkView === "result" && result ? (
                    <PlagiarismResultView
                      result={result}
                      sourceContent={content}
                      onRewrite={() => setTab("rewrite")}
                      onReCheck={() => setCheckView("form")}
                    />
                  ) : (
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
                        setCheckView("form");
                      }}
                      plist={plist}
                      selPid={selPid}
                      loadingP={loadingP}
                      onLoadProject={loadP}
                    />
                  )}
                </div>
              )}

              {tab === "rewrite" && result && (
                <PlagiarismRewriteView
                  checkId={result.checkId}
                  matches={result.matches}
                  fullContent={content}
                  scope={scope}
                  qualitySections={sections.length > 0 ? sections : undefined}
                  onSaveToProject={activeProjectId ? handleSaveToProject : undefined}
                  onApplied={handleAppliedRewrite}
                />
              )}

              {tab === "review" && (
                project && reviewSections.length > 0 ? (
                  <ReviewTab
                    key={activeProjectId}
                    variant="workspace"
                    title={project.title || "未命名论文"}
                    sections={reviewSections}
                    outline={project.outline}
                    references={project.references || []}
                    projectId={activeProjectId}
                    projectMode={getProjectWritingMode(project.mode)}
                    initialReport={savedReviewReport}
                    onReportSaved={handleReportSaved}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ClipboardCheck className="mb-4 h-12 w-12 text-[#1a5632]/25" />
                    <p className="text-sm font-medium text-[#122820]">审查需要绑定项目章节</p>
                    <p className="mt-1 max-w-sm text-xs text-[#6b7c72]">
                      请在查重页选择项目，系统会按 IMRAD / 综述结构加载各章正文。
                    </p>
                    <Button className="mt-4 bg-[#1a5632] hover:bg-[#144a2a]" onClick={() => setTab("check")}>
                      去选择项目
                    </Button>
                  </div>
                )
              )}

              {tab === "history" && (
                <UnifiedHistoryPanel
                  projectId={activeProjectId}
                  onViewPlagiarism={handleViewPlagiarismHistory}
                />
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
