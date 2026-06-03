"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Search, Shuffle, Loader2, CheckCircle2,
  Globe, ArrowLeft, Sparkles, ChevronDown, ChevronUp, RefreshCw,
  FileText, FolderOpen, Clock, Check, X,
} from "lucide-react";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import { usePlagiarismCheck } from "@/hooks/use-plagiarism-check";
import type { PlagiarismStage } from "@/hooks/use-plagiarism-check";
import Link from "next/link";
import { getProject, listProjects } from "@/services/project";
import { getCheckDetail, listHistory, rewriteMatch, toCheckResult, updateRewriteSuggestion } from "@/services/plagiarism";
import { useGoBack } from "@/contexts/navigation-history";
import { buildPlagiarismContentFromProject } from "@/lib/export-content";
import { workbenchFallback } from "@/lib/navigation";

// ==================== 类型 ====================

interface MatchResult {
  id: string;
  sourceText: string;
  sourceOffset: number;
  matchType: "self" | "local" | "web" | "cross" | "ai";
  matchedText: string;
  matchedFrom: string;
  matchedUrl?: string;
  similarity: number;
  riskLevel: "high" | "medium" | "low";
}

interface CheckResult {
  checkId: string;
  totalMatches: number;
  maxSimilarity: number;
  overallRisk: "high" | "medium" | "low";
  matches: MatchResult[];
}

interface RewriteSuggestion {
  strategy: string;
  suggestedText: string;
  similarityAfter?: number;
  id?: string;
}

const MATCH_ICONS: Record<MatchResult["matchType"], string> = { self: "📄", cross: "📚", local: "📖", web: "🌐", ai: "🤖" };
const STRATEGY_LABELS: Record<string, string> = { synonym: "同义替换", rephrase: "改写语序", summarize: "概括精简", expand: "扩写重组" };

// ==================== 页面 ====================

export default function PlagiarismPage() {
  return <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">加载中...</div>}><Content /></Suspense>;
}

function Content() {
  const sp = useSearchParams();
  const pid = sp.get("id");
  const goBack = useGoBack();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [web, setWeb] = useState(false);
  const { result: checkResult, checking, stage, check: doPlagiarismCheck, reset: resetPlagiarism } = usePlagiarismCheck();
  // 展示用的 result：active check 的结果 或 历史查看的结果
  const [historyResult, setHistoryResult] = useState<CheckResult | null>(null);
  const result = checkResult ?? historyResult;
  const [tab, setTab] = useState<"check" | "result" | "rewrite" | "review" | "history">("check");

  const [plist, setPlist] = useState<{ id: string; title: string }[]>([]);
  const [selPid, setSelPid] = useState(pid || "");
  const [loadingP, setLoadingP] = useState(false);

  useEffect(() => { listProjects().then(d => { if (Array.isArray(d)) setPlist(d); }).catch(() => {}); }, []);

  useEffect(() => {
    if (!pid) return;
    projectStore.get(pid).then(d => {
      if (!d) return;
      setProject(d); setTitle(d.title || ""); setSelPid(pid);
      setContent(buildPlagiarismContentFromProject(d));
    }).catch(() => {});
  }, [pid]);

  const loadP = async (id: string) => {
    if (!id) return;
    setLoadingP(true);
    try {
      const d = await getProject(id);
      if (!d) throw new Error("加载失败");
      setSelPid(id); setProject(d); setTitle(d.title || "");
      setContent(buildPlagiarismContentFromProject(d)); resetPlagiarism(); setTab("check");
      toast.success(`已导入「${d.title}」`);
    } catch { toast.error("加载失败"); }
    finally { setLoadingP(false); }
  };

  const doCheck = async () => {
    if (!content.trim()) { toast.error("请输入内容"); return; }
    await doPlagiarismCheck({ projectId: selPid || pid || undefined, title: title || "未命名", content, webSearch: web });
  };

  // 查重完成时自动跳转到结果页
  useEffect(() => {
    if (checkResult && !checking) {
      setTab("result");
      setHistoryResult(null);
      toast.success(`检测完成，${checkResult.totalMatches} 处匹配`);
    }
  }, [checkResult, checking]);

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
            论文质量检测
          </span>
          {project ? (
            <span className="ml-auto max-w-[40vw] truncate text-xs text-[#6b7c72]">{project.title}</span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col px-4 py-4 sm:px-6">
        <div className="mb-3 flex shrink-0 gap-1 overflow-x-auto rounded-lg bg-muted/40 p-1">
          {tabs.map(t => (
            <button key={t.k} className={`flex min-w-fit items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all sm:flex-1 ${tab === t.k ? "bg-background text-foreground shadow-sm" : t.dis ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground"}`} onClick={() => !t.dis && setTab(t.k)} disabled={t.dis}>
              <t.i className="h-3.5 w-3.5 shrink-0" />{t.l}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {tab === "check" && <CheckView title={title} setTitle={setTitle} content={content} setContent={setContent} web={web} setWeb={setWeb} checking={checking} stage={stage} onCheck={doCheck} plist={plist} selPid={selPid} loadingP={loadingP} onLoad={loadP} onClear={() => { setContent(""); resetPlagiarism(); setSelPid(""); }} />}
            {tab === "result" && result && <ResultView result={result} onRewrite={() => setTab("rewrite")} onReCheck={() => setTab("check")} />}
            {tab === "rewrite" && result && <RewriteView checkId={result.checkId} matches={result.matches} onReCheck={c => { setContent(c); resetPlagiarism(); setHistoryResult(null); setTab("check"); toast.success("已应用改写，点击「查重」验证"); }} />}
            {tab === "review" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-16">
                <FileText className="h-12 w-12 text-[#1a5632]/20" />
                <div>
                  <p className="text-sm font-medium text-[#122820]">论文审查已独立为专用页面</p>
                  <p className="text-xs text-[#6b7c72] mt-1">基于真实的 IMRAD 章节内容进行多维度审查</p>
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
            {tab === "history" && <HistoryView projectId={pid} onViewResult={r => { setHistoryResult(r); setTab("result"); }} />}
          </div>
        </div>
      </main>
    </div>
  );
}

// ==================== 输入 ====================

function CheckView({ title, setTitle, content, setContent, web, setWeb, checking, stage, onCheck, plist, selPid, loadingP, onLoad, onClear }: {
  title: string; setTitle: (v: string) => void; content: string; setContent: (v: string) => void;
  web: boolean; setWeb: (v: boolean) => void; checking: boolean; stage: PlagiarismStage | null; onCheck: () => void;
  plist: { id: string; title: string }[]; selPid: string; loadingP: boolean; onLoad: (id: string) => void; onClear: () => void;
}) {
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <select className="flex-1 bg-transparent text-sm outline-none" value={selPid} onChange={e => onLoad(e.target.value)} disabled={loadingP}>
          <option value="">选择已有项目导入内容...</option>
          {plist.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {loadingP && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <input type="text" className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/20" placeholder="检测标题（选填）" value={title} onChange={e => setTitle(e.target.value)} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <Textarea className="min-h-[280px] flex-1 resize-none pr-16 text-sm leading-relaxed" placeholder="在此粘贴论文内容，或从上方选择项目导入..." value={content} onChange={e => setContent(e.target.value)} />
        <span className="absolute bottom-3 right-4 text-[10px] tabular-nums text-muted-foreground">{content.length.toLocaleString()} 字</span>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={web} onChange={e => setWeb(e.target.checked)} className="rounded" /><Globe className="h-3.5 w-3.5" />联网搜索</label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClear}>清空</Button>
          <Button size="sm" onClick={onCheck} disabled={checking || !content.trim()}>{checking ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />检测中...</> : <><Search className="h-4 w-4 mr-1.5" />开始查重</>}</Button>
        </div>
      </div>
      {checking && stage && (
        <div className="px-1 pb-1">
          <div className="flex items-center gap-2 text-[11px] text-[#1a5632]">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{stage.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 结果 ====================

function ResultView({ result, onRewrite, onReCheck }: { result: CheckResult; onRewrite: () => void; onReCheck: () => void }) {
  const riskLabel = result.overallRisk === "high" ? "高风险" : result.overallRisk === "medium" ? "中风险" : "低风险";
  const riskCls = result.overallRisk === "high" ? "text-red-600 bg-red-50" : result.overallRisk === "medium" ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50";
  const typeStats = result.matches.reduce((a, m) => { a[m.matchType] = (a[m.matchType] || 0) + 1; return a; }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-lg bg-muted/30 border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold tabular-nums ${result.overallRisk === "high" ? "text-red-600" : result.overallRisk === "medium" ? "text-amber-600" : "text-green-600"}`}>{(result.maxSimilarity * 100).toFixed(1)}%</span>
            <div><Badge variant="secondary" className={`text-[10px] ${riskCls}`}>{riskLabel}</Badge><p className="text-[10px] text-muted-foreground mt-0.5">{result.totalMatches} 处匹配</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onReCheck}><RefreshCw className="h-3.5 w-3.5 mr-1" />重新检测</Button>
            {result.matches.length > 0 && <Button size="sm" onClick={onRewrite}><Sparkles className="h-3.5 w-3.5 mr-1" />AI 降重</Button>}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2"><div className={`h-full rounded-full transition-all duration-500 ${result.overallRisk === "high" ? "bg-red-500" : result.overallRisk === "medium" ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${result.maxSimilarity * 100}%` }} /></div>
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {Object.entries(typeStats).map(([t, n]) => <span key={t}>{MATCH_ICONS[t as MatchResult["matchType"]]} {n}</span>)}
        </div>
      </div>

      {result.matches.length > 0 ? (
        <div className="space-y-1.5">{result.matches.map((m, i) => <MatchRow key={m.id} match={m} index={i} />)}</div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><CheckCircle2 className="h-8 w-8 mb-2 text-green-500" /><p className="text-sm">未发现相似内容</p></div>
      )}
    </div>
  );
}

function MatchRow({ match, index }: { match: MatchResult; index: number }) {
  const [open, setOpen] = useState(false);
  const dot = match.riskLevel === "high" ? "bg-red-500" : match.riskLevel === "medium" ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-muted/30 transition-colors" onClick={() => setOpen(!open)}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="text-xs text-muted-foreground w-5 shrink-0">{index + 1}</span>
        <p className="flex-1 text-sm truncate">{match.sourceText.slice(0, 70)}...</p>
        <Badge variant="outline" className="text-xs tabular-nums shrink-0">{(match.similarity * 100).toFixed(0)}%</Badge>
        <span className="text-xs shrink-0">{MATCH_ICONS[match.matchType]} <span className="text-muted-foreground text-[10px]">{match.matchType === "web" ? "联网" : match.matchType === "self" ? "自引" : match.matchType === "cross" ? "跨项目" : match.matchType === "local" ? "知识库" : "AI"}</span></span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground/50" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
      </div>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t space-y-2">
          <p className="text-xs text-muted-foreground">来源：{match.matchedUrl ? <a href={match.matchedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{match.matchedFrom}</a> : match.matchedFrom}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-red-50 border border-red-100"><span className="text-[10px] text-red-400 block mb-1">原文</span><p className="text-foreground/70 leading-relaxed">{match.sourceText}</p></div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100"><span className="text-[10px] text-amber-400 block mb-1">匹配内容</span><p className="text-foreground/70 leading-relaxed">{match.matchedText}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 降重 ====================

function RewriteView({ checkId, matches, onReCheck }: { checkId: string; matches: MatchResult[]; onReCheck: (c: string) => void }) {
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, RewriteSuggestion[]>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const doRewrite = async (m: MatchResult) => {
    setRewriting(m.id);
    try {
      const suggestions = await rewriteMatch({ checkId, matchId: m.id, originalText: m.sourceText });
      setSuggestions(p => ({ ...p, [m.id]: suggestions }));
      toast.success("改写建议已生成");
    } catch (err: unknown) { toast.error(err instanceof Error ? getErrorMessage(err) : "改写失败"); }
    finally { setRewriting(null); }
  };

  const accept = (mid: string, s: RewriteSuggestion) => {
    if (s.id) updateRewriteSuggestion({ suggestionId: s.id, status: "accepted" }).catch(() => {});
    navigator.clipboard.writeText(s.suggestedText).then(() => { setCopiedId(`${mid}-${s.strategy}`); setTimeout(() => setCopiedId(null), 1500); }).catch(() => {});
    setAccepted(p => ({ ...p, [`${mid}-${s.strategy}`]: true }));
    toast.success("已采纳并复制");
  };

  const reject = (mid: string, s: RewriteSuggestion) => {
    if (s.id) updateRewriteSuggestion({ suggestionId: s.id, status: "rejected" }).catch(() => {});
    setAccepted(p => ({ ...p, [`${mid}-${s.strategy}`]: false }));
  };

  const hr = matches.filter(m => m.riskLevel !== "low");
  const hasA = Object.values(accepted).some(v => v === true);

  if (hr.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><CheckCircle2 className="h-8 w-8 mb-2 text-green-500" /><p className="text-sm">没有需要降重的内容</p></div>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground"><Sparkles className="h-4 w-4 inline mr-1 text-primary/60" />{hr.length} 处需要降重</span>
        {hasA && <Button size="sm" onClick={() => { let c = ""; for (const m of hr) { const s = suggestions[m.id]?.find(s => accepted[`${m.id}-${s.strategy}`] === true); c += (s?.suggestedText || m.sourceText) + "\n\n"; } onReCheck(c.trim()); }}><Search className="h-3.5 w-3.5 mr-1" />应用改写并重新查重</Button>}
      </div>

      {hr.map((m, i) => (
        <div key={m.id} className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-xs text-muted-foreground">#{i + 1}</span>
            <p className="flex-1 text-sm text-muted-foreground truncate">{m.sourceText.slice(0, 60)}...</p>
            <Badge variant="outline" className="text-xs tabular-nums text-red-500">{(m.similarity * 100).toFixed(0)}%</Badge>
            <Button variant="ghost" size="sm" onClick={() => doRewrite(m)} disabled={rewriting === m.id}>{rewriting === m.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}{rewriting === m.id ? "生成中" : "降重"}</Button>
          </div>
          {suggestions[m.id]?.map((s, si) => {
            const k = `${m.id}-${s.strategy}`, isA = accepted[k] === true, isR = accepted[k] === false, isC = copiedId === k;
            return (
              <div key={si} className={`mx-2 mb-2 p-2.5 rounded-lg border text-sm leading-relaxed transition-colors ${isA ? "bg-green-50 border-green-200" : isR ? "bg-muted/20 border-border opacity-40" : "bg-muted/20 border-border"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{STRATEGY_LABELS[s.strategy]}</Badge>
                    {s.similarityAfter != null && s.similarityAfter < 1 && <span className="text-[10px] text-green-600 tabular-nums">→ {(s.similarityAfter * 100).toFixed(0)}%</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {!isA && !isR && <>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-green-600" onClick={() => accept(m.id, s)}><Check className="h-3 w-3 mr-0.5" />采纳</Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => reject(m.id, s)}><X className="h-3 w-3 mr-0.5" />忽略</Button>
                    </>}
                    {isA && <span className="text-[10px] text-green-600">{isC ? "已复制 ✓" : "已采纳"}</span>}
                    {isR && <span className="text-[10px] text-muted-foreground">已忽略</span>}
                  </div>
                </div>
                <p className={isR ? "line-through text-muted-foreground" : ""}>{s.suggestedText}</p>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ==================== 历史 ====================

interface HC { id: string; title: string; maxSimilarity: number; overallRisk: string; createdAt: string; _count?: { matches: number } }

function HistoryView({ projectId, onViewResult }: { projectId?: string | null; onViewResult: (r: CheckResult) => void }) {
  const [checks, setChecks] = useState<HC[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listHistory({ projectId: projectId || undefined })
      .then(checks => setChecks(checks as HC[]))
      .catch(() => setChecks([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const load = async (id: string) => {
    try {
      const detail = await getCheckDetail(id);
      onViewResult(toCheckResult(detail));
    } catch { toast.error("加载详情失败"); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (checks.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><Clock className="h-8 w-8 mb-2 opacity-30" /><p className="text-sm">暂无查重记录</p></div>;

  return (
    <div className="space-y-2">
      {checks.map(c => {
        const risk = c.maxSimilarity > 0.35 ? "high" : c.maxSimilarity > 0.15 ? "medium" : "low";
        const dot = risk === "high" ? "bg-red-500" : risk === "medium" ? "bg-amber-500" : "bg-green-500";
        return (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => load(c.id)}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{c.title}</p><p className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString("zh-CN")}</p></div>
            <Badge variant="outline" className="text-xs tabular-nums">{(c.maxSimilarity * 100).toFixed(1)}%</Badge>
            <span className="text-xs text-muted-foreground">{c._count?.matches || 0} 处</span>
          </div>
        );
      })}
    </div>
  );
}
