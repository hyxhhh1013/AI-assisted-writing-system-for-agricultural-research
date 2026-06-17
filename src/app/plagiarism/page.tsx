"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, ArrowLeft, FileText, Clock, Loader2, Shuffle,
} from "lucide-react";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import { usePlagiarismCheck } from "@/hooks/use-plagiarism-check";
import Link from "next/link";
import { getProject, listProjects } from "@/services/project";
import { getCheckDetail, listHistory, toCheckResult } from "@/services/plagiarism";
import { useGoBack } from "@/contexts/navigation-history";
import { buildPlagiarismContentFromProject } from "@/lib/export-content";
import { workbenchFallback } from "@/lib/navigation";
import { PlagiarismCheckForm } from "@/components/shared/plagiarism/check-form";
import { PlagiarismResultView } from "@/components/shared/plagiarism/result-view";
import { PlagiarismRewriteView } from "@/components/shared/plagiarism/rewrite-view";
import { riskDotClass } from "@/components/shared/plagiarism/constants";

interface HistoryCheck {
  id: string;
  title: string;
  maxSimilarity: number;
  overallRisk: string;
  createdAt: string;
  _count?: { matches: number };
}

export default function PlagiarismPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">加载中...</div>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const sp = useSearchParams();
  const pid = sp.get("id");
  const goBack = useGoBack();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [web, setWeb] = useState(false);
  const { result: checkResult, checking, stage, error, check: doPlagiarismCheck, cancel, reset: resetPlagiarism } = usePlagiarismCheck();
  const [historyResult, setHistoryResult] = useState<PlagiarismCheckResult | null>(null);
  const result = checkResult ?? historyResult;
  const [tab, setTab] = useState<"check" | "result" | "rewrite" | "review" | "history">("check");

  const [plist, setPlist] = useState<{ id: string; title: string }[]>([]);
  const [selPid, setSelPid] = useState(pid || "");
  const [loadingP, setLoadingP] = useState(false);

  useEffect(() => {
    listProjects().then((d) => { if (Array.isArray(d)) setPlist(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pid) return;
    projectStore.get(pid).then((d) => {
      if (!d) return;
      setProject(d);
      setTitle(d.title || "");
      setSelPid(pid);
      setContent(buildPlagiarismContentFromProject(d));
    }).catch(() => {});
  }, [pid]);

  const loadP = async (id: string) => {
    if (!id) return;
    setLoadingP(true);
    try {
      const d = await getProject(id);
      if (!d) throw new Error("加载失败");
      setSelPid(id);
      setProject(d);
      setTitle(d.title || "");
      setContent(buildPlagiarismContentFromProject(d));
      resetPlagiarism();
      setHistoryResult(null);
      setTab("check");
      toast.success(`已导入「${d.title}」`);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoadingP(false);
    }
  };

  const doCheck = async () => {
    if (!content.trim()) { toast.error("请输入内容"); return; }
    await doPlagiarismCheck({
      projectId: selPid || pid || undefined,
      title: title || "未命名",
      content,
      webSearch: web,
    });
  };

  useEffect(() => {
    if (checkResult && !checking) {
      setTab("result");
      setHistoryResult(null);
      toast.success(`检测完成，${checkResult.totalMatches} 处匹配`);
    }
  }, [checkResult, checking]);

  const handleAppliedRewrite = (newContent: string) => {
    setContent(newContent);
    resetPlagiarism();
    setHistoryResult(null);
    setTab("check");
    toast.success("已应用改写，点击「开始查重」验证");
  };

  const tabs = [
    { k: "check" as const, l: "查重检测", i: Search },
    { k: "result" as const, l: "检测结果", i: FileText, dis: !result },
    { k: "rewrite" as const, l: "AI 降重", i: Shuffle, dis: !result },
    { k: "review" as const, l: "论文审查", i: FileText },
    { k: "history" as const, l: "历史记录", i: Clock },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#faf9f6]">
      <header className="z-10 shrink-0 border-b border-[#1a5632]/10 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
            onClick={() => goBack(workbenchFallback(pid))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[#122820]">
            <Search className="h-4 w-4 text-[#1a5632]" />
            论文查重与降重
          </span>
          {project ? (
            <span className="ml-auto max-w-[40vw] truncate text-xs text-[#6b7c72]">{project.title}</span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col px-4 py-4 sm:px-6">
        <div className="mb-3 flex shrink-0 gap-1 overflow-x-auto rounded-lg bg-muted/40 p-1">
          {tabs.map((t) => (
            <button
              key={t.k}
              type="button"
              className={`flex min-w-fit items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all sm:flex-1 ${tab === t.k ? "bg-background text-foreground shadow-sm" : t.dis ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => !t.dis && setTab(t.k)}
              disabled={t.dis}
            >
              <t.i className="h-3.5 w-3.5 shrink-0" />
              {t.l}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {tab === "check" && (
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
                onClear={() => { setContent(""); resetPlagiarism(); setHistoryResult(null); setSelPid(""); }}
                plist={plist}
                selPid={selPid}
                loadingP={loadingP}
                onLoadProject={loadP}
              />
            )}
            {tab === "result" && result && (
              <PlagiarismResultView
                result={result}
                onRewrite={() => setTab("rewrite")}
                onReCheck={() => setTab("check")}
              />
            )}
            {tab === "rewrite" && result && (
              <PlagiarismRewriteView
                checkId={result.checkId}
                matches={result.matches}
                fullContent={content}
                onApplied={handleAppliedRewrite}
              />
            )}
            {tab === "review" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-16">
                <FileText className="h-12 w-12 text-[#1a5632]/20" />
                <div>
                  <p className="text-sm font-medium text-[#122820]">论文审查已独立为专用页面</p>
                  <p className="text-xs text-[#6b7c72] mt-1">基于 IMRAD 章节进行多维度审查</p>
                </div>
                <Link
                  href={pid ? `/review?id=${pid}` : "/review"}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1a5632] px-5 py-2 text-sm font-medium text-white shadow-sm shadow-[#1a5632]/25 hover:bg-[#144a2a] transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  打开论文审查
                </Link>
              </div>
            )}
            {tab === "history" && (
              <HistoryView
                projectId={selPid || pid}
                onViewResult={(r) => { setHistoryResult(r); setTab("result"); }}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function HistoryView({ projectId, onViewResult }: { projectId?: string | null; onViewResult: (r: PlagiarismCheckResult) => void }) {
  const [checks, setChecks] = useState<HistoryCheck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listHistory({ projectId: projectId || undefined })
      .then((rows) => setChecks(rows as HistoryCheck[]))
      .catch(() => setChecks([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const load = async (id: string) => {
    try {
      const detail = await getCheckDetail(id);
      onViewResult(toCheckResult(detail));
    } catch {
      toast.error("加载详情失败");
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (checks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Clock className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-sm">暂无查重记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {checks.map((c) => {
        const risk = c.maxSimilarity > 0.35 ? "high" : c.maxSimilarity > 0.15 ? "medium" : "low";
        return (
          <button
            key={c.id}
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
            onClick={() => load(c.id)}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${riskDotClass(risk)}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.title}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString("zh-CN")}</p>
            </div>
            <Badge variant="outline" className="text-xs tabular-nums">{(c.maxSimilarity * 100).toFixed(1)}%</Badge>
            <span className="text-xs text-muted-foreground">{c._count?.matches || 0} 处</span>
          </button>
        );
      })}
    </div>
  );
}
