"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Clock, Loader2,
} from "lucide-react";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import type { FixableReviewReport } from "@/contracts/review";
import { usePlagiarismCheck } from "@/hooks/use-plagiarism-check";
import { getProject, listProjects } from "@/services/project";
import { getHistory as getReviewHistory, getDetail as getReviewDetail } from "@/services/review";
import { listHistory, getCheckDetail } from "@/services/plagiarism";
import { buildFixableReportFromDetail, buildRestoredPlagiarismSession } from "@/lib/quality-state";
import type { ReviewHistoryItem } from "@/contracts/review";
import { useGoBack } from "@/contexts/navigation-history";
import { workbenchFallback } from "@/lib/navigation";
import {
  buildQualitySections,
  buildCheckContentFromSections,
  sectionHitCounts,
  type QualitySection,
} from "@/lib/quality-sections";
import { getProjectWritingMode } from "@/lib/section-registry";
import { ReviewTab, type ReviewDeskBinding } from "@/components/shared/review-tab";
import { SectionSidebar } from "@/components/shared/quality/section-sidebar";
import { UnifiedHistoryPanel } from "@/components/shared/quality/unified-history-panel";
import { persistQualitySections } from "@/lib/quality-state";
import {
  isHistoryTab,
  parseQualityTab,
  type QualityStation,
} from "@/components/shared/quality/types";
import { ReadingDesk } from "@/components/shared/quality/reading-desk";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function QualityWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pid = searchParams.get("id");
  const goBack = useGoBack();

  const initialTab = parseQualityTab(searchParams.get("tab"));
  const [tab, setTabState] = useState<QualityStation>(initialTab);
  const [historyOpen, setHistoryOpen] = useState(() => isHistoryTab(searchParams.get("tab")));
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
  const [reviewDesk, setReviewDesk] = useState<ReviewDeskBinding | null>(null);
  const [restoringSession, setRestoringSession] = useState(false);
  const [previousOverlap, setPreviousOverlap] = useState<number | null>(null);

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
  const reviewDeskProjectRef = useRef<string | undefined>(undefined);
  if (reviewDeskProjectRef.current !== activeProjectId) {
    reviewDeskProjectRef.current = activeProjectId;
    setReviewDesk(null);
  }

  const sections = useMemo<QualitySection[]>(
    () => (project ? buildQualitySections(project) : []),
    [project],
  );

  const lastToastCheckIdRef = useRef<string | null>(null);
  const sessionRestoredForRef = useRef<string | null>(null);

  const syncSessionParams = useCallback((patch: { tab?: QualityStation; checkId?: string; reviewId?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeProjectId) params.set("id", activeProjectId);
    if (patch.tab) params.set("tab", patch.tab);
    if (patch.checkId) params.set("checkId", patch.checkId);
    if (patch.reviewId) params.set("reviewId", patch.reviewId);
    router.replace(`/plagiarism?${params.toString()}`, { scroll: false });
  }, [activeProjectId, router, searchParams]);

  const setTab = useCallback((next: QualityStation) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (activeProjectId) params.set("id", activeProjectId);
    params.set("tab", next);
    router.replace(`/plagiarism?${params.toString()}`, { scroll: false });
  }, [activeProjectId, router, searchParams]);

  useEffect(() => {
    const nextTab = parseQualityTab(searchParams.get("tab"));
    setTabState(nextTab);
    if (isHistoryTab(searchParams.get("tab"))) setHistoryOpen(true);
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
    setTabState("check");
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
      setTab("overview");
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
    const scoped = scope === "full" ? sections : sections.filter((section) => section.key === scope);
    const fromSections = scoped.length > 0 ? buildCheckContentFromSections(scoped, "full") : "";
    setPreviousOverlap(null);
    await doPlagiarismCheck({
      projectId: activeProjectId,
      title: title || "未命名",
      content,
      webSearch: web,
      sections: fromSections === content
        ? scoped.map((section) => ({ key: section.key, title: section.title, content: section.content }))
        : undefined,
      referenceTitles: project?.references ?? [],
    });
  };

  const handleSaveToProject = useCallback(async (updated: QualitySection[], changedKeys: string[]) => {
    if (!activeProjectId) return;
    await persistQualitySections(activeProjectId, sections, updated, changedKeys);
    const d = await getProject(activeProjectId);
    if (d) applyProject(d, activeProjectId);
    toast.success(`已写回 ${changedKeys.length} 个章节到项目`);
  }, [activeProjectId, sections, applyProject]);

  const handleAppliedRewrite = (
    newContent: string,
    hint?: { sections?: QualitySection[]; label: string },
  ) => {
    const prev = result?.overlapCoverage;
    setPreviousOverlap(typeof prev === "number" ? prev : null);
    setContent(newContent);
    setHistoryResult(null);
    const changed = (hint?.sections ?? []).filter((section) => section.content.trim().length > 0);
    const recheckContent = changed.length > 0
      ? buildCheckContentFromSections(changed, "full")
      : newContent;
    void doPlagiarismCheck({
      projectId: activeProjectId,
      title: title || "未命名",
      content: recheckContent,
      webSearch: false,
      literalOnly: true,
      sections: changed.length > 0
        ? changed.map((section) => ({ key: section.key, title: section.title, content: section.content }))
        : undefined,
      referenceTitles: project?.references ?? [],
      recheckLabel: hint?.label ?? "已改写正文",
    });
  };

  const openManuscript = () => {
    setTab("overview");
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
    setTab("check");
    syncSessionParams({ tab: "check", checkId: r.checkId });
  }, [restoreResult, setTab, syncSessionParams]);

  const reviewSections = useMemo(
    () => sections.map((s) => ({ key: s.key, title: s.title, content: s.content })),
    [sections],
  );

  const sectionHits = useMemo(
    () => (result ? sectionHitCounts(sections, content, result.matches) : null),
    [result, sections, content],
  );

  const showSectionSidebar = sections.length > 0;

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
            {tab === "review" ? (
              <button
                type="button"
                onClick={openManuscript}
                className="rounded-lg border border-[#1a5632]/15 bg-[#faf9f6] px-2.5 py-1 text-[10px] text-[#3d4f46] hover:bg-[#1a5632]/5"
              >
                返回正文
              </button>
            ) : (reviewDesk?.report || lastReview) ? (
              <button
                type="button"
                onClick={() => setTab("review")}
                className="rounded-lg border border-[#1a5632]/15 bg-[#faf9f6] px-2.5 py-1 text-[10px] text-[#3d4f46] hover:bg-[#1a5632]/5"
              >
                审查 {reviewDesk?.report?.overallScore ?? lastReview?.overallScore ?? "—"} 分
              </button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-[#3d4f46]"
              onClick={() => setHistoryOpen(true)}
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              历史
            </Button>
          </div>
          {(loadingP || restoringSession) && <Loader2 className="h-4 w-4 animate-spin text-[#1a5632]" />}
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1 px-3 py-3 sm:px-4 lg:px-6 xl:px-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#1a5632]/10 bg-white shadow-sm">
            {showSectionSidebar && (
              <SectionSidebar
                sections={sections}
                activeScope={scope}
                onSelectScope={setScope}
                hitCounts={sectionHits}
              />
            )}

            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <ReadingDesk
                hasProject={Boolean(activeProjectId && project)}
                content={content}
                result={result}
                previousOverlap={previousOverlap}
                checking={checking}
                stage={stage}
                error={error}
                webSearch={web}
                onWebSearch={setWeb}
                projects={plist}
                selectedProjectId={selPid}
                loadingProject={loadingP}
                onLoadProject={(id) => { void loadP(id); }}
                onCheck={() => { void doCheck(); }}
                onCancel={cancel}
                sections={sections}
                scope={scope}
                onSaveToProject={activeProjectId ? handleSaveToProject : undefined}
                onApplied={handleAppliedRewrite}
                reviewOpen={tab === "review"}
                onOpenReview={() => setTab("review")}
                onCloseReview={openManuscript}
                reviewReport={reviewDesk?.report ?? savedReviewReport}
                reviewRunning={reviewDesk?.isReviewing ?? false}
                reviewProgress={reviewDesk?.progress ?? ""}
                onRunReview={reviewDesk ? () => { reviewDesk.run(); } : undefined}
                projectId={activeProjectId}
                onFixReviewIssue={(dimension, index) => {
                  if (!reviewDesk) return;
                  const sectionContents = Object.fromEntries(sections.map((section) => [section.key, section.content]));
                  void reviewDesk.fixIssue(dimension, index, sectionContents, project?.title || title);
                }}
                onDismissReviewIssue={(dimension, index) => reviewDesk?.dismissIssue(dimension, index)}
                onApplyReviewIssue={(dimension, index) => reviewDesk?.applyFix(dimension, index)}
              />
            </main>
          </div>
        </div>
      </div>

      {project && reviewSections.length > 0 && (
        <div className="hidden" aria-hidden="true">
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
            onDeskState={setReviewDesk}
          />
        </div>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>检测历史</DialogTitle>
          </DialogHeader>
          <UnifiedHistoryPanel
            projectId={activeProjectId}
            onViewPlagiarism={(r) => {
              setHistoryOpen(false);
              void handleViewPlagiarismHistory(r);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
