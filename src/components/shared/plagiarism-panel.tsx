"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { checkPlagiarismStream, rewriteMatch, updateRewriteSuggestion } from "@/services/plagiarism";
import { getProject, listProjects } from "@/services/project";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-utils";
import { buildPlagiarismContentFromProject } from "@/lib/export-content";
import {
  Search, Shuffle, Loader2, CheckCircle2,
  Globe, Sparkles, ChevronDown, ChevronUp, RefreshCw,
  FileText, FolderOpen, Check, X,
} from "lucide-react";

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
  stats?: {
    totalParagraphs: number;
    processingTime: number;
  };
}

interface RewriteSuggestion {
  strategy: string;
  suggestedText: string;
  similarityAfter?: number;
  id?: string;
}

interface ProjectOption {
  id: string;
  title: string;
}

interface PlagiarismPanelProps {
  projectId?: string;
  projectTitle?: string;
  initialContent?: string;
  showProjectSelector?: boolean;
}

// ==================== 常量 ====================

const MATCH_ICONS: Record<MatchResult["matchType"], string> = {
  self: "📄", cross: "📚", local: "📖", web: "🌐", ai: "🤖",
};

const STRATEGY_LABELS: Record<string, string> = {
  synonym: "同义替换", rephrase: "改写语序", summarize: "概括精简", expand: "扩写重组",
};

// ==================== 主组件 ====================

export function PlagiarismPanel({
  projectId, projectTitle, initialContent, showProjectSelector = false,
}: PlagiarismPanelProps) {
  const [checkTitle, setCheckTitle] = useState(projectTitle || "");
  const [checkContent, setCheckContent] = useState(initialContent || "");
  const [webSearch, setWebSearch] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [view, setView] = useState<"check" | "result" | "rewrite">("check");

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [loadingProject, setLoadingProject] = useState(false);

  useEffect(() => {
    if (showProjectSelector) {
      listProjects().then(d => { if (Array.isArray(d)) setProjects(d); }).catch(() => {});
    }
  }, [showProjectSelector]);

  useEffect(() => { if (initialContent) setCheckContent(initialContent); }, [initialContent]);
  useEffect(() => { if (projectTitle) setCheckTitle(projectTitle); }, [projectTitle]);

  const loadProject = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoadingProject(true);
    try {
      const p = await getProject(pid);
      if (!p) throw new Error("加载失败");
      setSelectedProjectId(pid);
      setCheckTitle(p.title || "");
      setCheckContent(buildPlagiarismContentFromProject(p));
      setResult(null);
      setView("check");
      toast.success(`已导入「${p.title}」`);
    } catch { toast.error("加载失败"); }
    finally { setLoadingProject(false); }
  }, []);

  const handleCheck = useCallback(async () => {
    if (!checkContent.trim()) { toast.error("请输入要检测的内容"); return; }
    if (checkContent.length > 100000) { toast.error("内容超过 10 万字上限"); return; }
    setIsChecking(true);
    setResult(null);
    try {
      const data = await checkPlagiarismStream(
        { projectId: selectedProjectId || projectId, title: checkTitle || "未命名", content: checkContent, webSearch },
        (event) => {
          if (event.type === "progress") {
            setCheckStatus(event.message);
          }
        },
      );
      setResult(data);
      setView("result");
      toast.success(`检测完成，${data.totalMatches} 处匹配`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "查重失败");
    } finally { setIsChecking(false); setCheckStatus(""); }
  }, [checkContent, checkTitle, projectId, selectedProjectId, webSearch]);

  // ==================== 输入 ====================
  if (view === "check") {
    return (
      <div className="flex flex-col gap-1.5 h-full">
        {showProjectSelector && !initialContent && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border bg-muted/30">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              className="flex-1 text-xs bg-transparent outline-none"
              value={selectedProjectId}
              onChange={e => loadProject(e.target.value)}
              disabled={loadingProject}
            >
              <option value="">选择项目导入...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {loadingProject && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        )}

        <input
          type="text"
          className="text-xs px-2 py-1.5 rounded-md border bg-background outline-none focus:ring-1 focus:ring-primary/20"
          placeholder="检测标题"
          value={checkTitle}
          onChange={e => setCheckTitle(e.target.value)}
        />

        <div className="flex-1 min-h-0">
          <Textarea
            className="h-full text-xs font-mono resize-none placeholder:text-muted-foreground/50"
            placeholder="粘贴论文内容，或从上方选择项目导入..."
            value={checkContent}
            onChange={e => setCheckContent(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} className="rounded" />
            <Globe className="h-3 w-3" /> 联网
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground tabular-nums">{checkContent.length.toLocaleString()}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setCheckContent(""); setResult(null); setSelectedProjectId(""); }}>清空</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleCheck} disabled={isChecking || !checkContent.trim()}>
              {isChecking ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{checkStatus}</> : <><Search className="h-3 w-3 mr-1" />查重</>}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  // ==================== 结果 ====================
  if (view === "result") {
    const riskText = result.overallRisk === "high" ? "高风险" : result.overallRisk === "medium" ? "中风险" : "低风险";
    const riskCls = result.overallRisk === "high" ? "text-red-600 bg-red-50" : result.overallRisk === "medium" ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50";

    return (
      <div className="flex flex-col gap-1.5 h-full">
        {/* 概要 */}
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
          <span className={`text-lg font-bold tabular-nums ${result.overallRisk === "high" ? "text-red-600" : result.overallRisk === "medium" ? "text-amber-600" : "text-green-600"}`}>
            {(result.maxSimilarity * 100).toFixed(1)}%
          </span>
          <Badge variant="secondary" className={`text-[10px] ${riskCls}`}>{riskText}</Badge>
          <span className="text-xs text-muted-foreground ml-auto">{result.totalMatches} 处匹配</span>
        </div>

        {/* 进度条 */}
        <div className="h-1 rounded-full bg-muted overflow-hidden shrink-0">
          <div
            className={`h-full rounded-full transition-all duration-500 ${result.overallRisk === "high" ? "bg-red-500" : result.overallRisk === "medium" ? "bg-amber-500" : "bg-green-500"}`}
            style={{ width: `${result.maxSimilarity * 100}%` }}
          />
        </div>

        {/* 列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {result.matches.length > 0 ? (
            <div className="space-y-1">
              {result.matches.map((m, i) => <MatchItem key={m.id} match={m} index={i} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <CheckCircle2 className="h-6 w-6 mb-1 text-green-500" />
              <p className="text-xs">未发现相似内容</p>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex gap-1.5 shrink-0 pt-1.5 border-t">
          <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setView("check")}><RefreshCw className="h-3 w-3 mr-1" />重新检测</Button>
          {result.matches.length > 0 && (
            <Button size="sm" className="h-7 text-xs flex-1" onClick={() => setView("rewrite")}><Shuffle className="h-3 w-3 mr-1" />AI 降重</Button>
          )}
        </div>
      </div>
    );
  }

  // ==================== 降重 ====================
  return (
    <RewriteView
      checkId={result.checkId}
      matches={result.matches}
      onBack={() => setView("result")}
      onReCheck={content => { setCheckContent(content); setResult(null); setView("check"); toast.success("已应用改写，点击「查重」验证"); }}
    />
  );
}

// ==================== 匹配项 ====================

function MatchItem({ match, index }: { match: MatchResult; index: number }) {
  const [open, setOpen] = useState(false);
  const dot = match.riskLevel === "high" ? "bg-red-500" : match.riskLevel === "medium" ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="rounded-lg border bg-card text-sm">
      <div className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-muted/30 transition-colors" onClick={() => setOpen(!open)}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="text-[10px] text-muted-foreground w-4 shrink-0">{index + 1}</span>
        <p className="flex-1 text-xs text-muted-foreground truncate">{match.sourceText.slice(0, 55)}</p>
        <Badge variant="outline" className="text-[10px] tabular-nums shrink-0 h-4 px-1">{(match.similarity * 100).toFixed(0)}%</Badge>
        <span className="text-[10px] shrink-0">{MATCH_ICONS[match.matchType]}</span>
        {open ? <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground/50" /> : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
      </div>
      {open && (
        <div className="px-2 pb-2 pt-1 border-t text-xs space-y-1">
          <p className="text-muted-foreground truncate">来源：{match.matchedFrom}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-red-50 border border-red-100"><span className="text-[10px] text-red-400 block mb-0.5">原文</span><span className="text-foreground/70 leading-relaxed">{match.sourceText.slice(0, 120)}</span></div>
            <div className="p-2 rounded bg-amber-50 border border-amber-100"><span className="text-[10px] text-amber-400 block mb-0.5">匹配</span><span className="text-foreground/70 leading-relaxed">{match.matchedText.slice(0, 120)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 降重面板 ====================

function RewriteView({ checkId, matches, onBack, onReCheck }: {
  checkId: string; matches: MatchResult[]; onBack: () => void; onReCheck?: (c: string) => void;
}) {
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

  const accept = async (mid: string, s: RewriteSuggestion) => {
    if (s.id) updateRewriteSuggestion({ suggestionId: s.id, status: "accepted" }).catch(() => {});
    navigator.clipboard.writeText(s.suggestedText).then(() => { setCopiedId(`${mid}-${s.strategy}`); setTimeout(() => setCopiedId(null), 1500); }).catch(() => {});
    setAccepted(p => ({ ...p, [`${mid}-${s.strategy}`]: true }));
    toast.success("已采纳并复制");
  };

  const reject = (mid: string, s: RewriteSuggestion) => {
    if (s.id) updateRewriteSuggestion({ suggestionId: s.id, status: "rejected" }).catch(() => {});
    setAccepted(p => ({ ...p, [`${mid}-${s.strategy}`]: false }));
  };

  const highRisk = matches.filter(m => m.riskLevel !== "low");
  const hasAccepted = Object.values(accepted).some(v => v === true);

  if (highRisk.length === 0) {
    return <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><CheckCircle2 className="h-6 w-6 mb-1 text-green-500" /><p className="text-xs">没有需要降重的内容</p><Button variant="ghost" size="sm" className="h-7 text-xs mt-2" onClick={onBack}>返回</Button></div>;
  }

  return (
    <div className="flex flex-col gap-2.5 h-full">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground"><Sparkles className="h-3 w-3 inline mr-1 text-primary/60" />{highRisk.length} 处需要降重</span>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={onBack}><RefreshCw className="h-2.5 w-2.5 mr-0.5" />返回</Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        <div className="space-y-2">
          {highRisk.map((m, i) => (
            <div key={m.id} className="rounded-lg border bg-card">
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                <p className="flex-1 text-xs text-muted-foreground truncate">{m.sourceText.slice(0, 45)}</p>
                <Badge variant="outline" className="text-[10px] tabular-nums h-4 px-1 text-red-500">{(m.similarity * 100).toFixed(0)}%</Badge>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => doRewrite(m)} disabled={rewriting === m.id}>
                  {rewriting === m.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                  <span className="ml-0.5">{rewriting === m.id ? "..." : "降重"}</span>
                </Button>
              </div>

              {suggestions[m.id]?.map((s, si) => {
                const k = `${m.id}-${s.strategy}`;
                const isA = accepted[k] === true, isR = accepted[k] === false, isC = copiedId === k;
                return (
                  <div key={si} className={`mx-1.5 mb-1.5 p-1.5 rounded text-[11px] leading-relaxed border transition-colors ${isA ? "bg-green-50 border-green-200" : isR ? "bg-muted/20 border-border opacity-40" : "bg-muted/20 border-border"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1">{STRATEGY_LABELS[s.strategy]}</Badge>
                        {s.similarityAfter != null && s.similarityAfter < 1 && <span className="text-[9px] text-green-600 tabular-nums">→ {(s.similarityAfter * 100).toFixed(0)}%</span>}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {!isA && !isR && <>
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] text-green-600" onClick={() => accept(m.id, s)}><Check className="h-2.5 w-2.5 mr-0.5" />采纳</Button>
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] text-muted-foreground" onClick={() => reject(m.id, s)}><X className="h-2.5 w-2.5 mr-0.5" />忽略</Button>
                        </>}
                        {isA && <span className="text-[9px] text-green-600">{isC ? "已复制 ✓" : "已采纳"}</span>}
                        {isR && <span className="text-[9px] text-muted-foreground">已忽略</span>}
                      </div>
                    </div>
                    <p className={isR ? "line-through text-muted-foreground" : ""}>{s.suggestedText}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {hasAccepted && (
        <div className="shrink-0 pt-1.5 border-t">
          <Button size="sm" className="h-7 text-xs w-full" onClick={() => {
            let c = "";
            for (const m of highRisk) { const s = suggestions[m.id]?.find(s => accepted[`${m.id}-${s.strategy}`] === true); c += (s?.suggestedText || m.sourceText) + "\n\n"; }
            onReCheck?.(c.trim());
          }}><Search className="h-3 w-3 mr-1" />应用改写并重新查重</Button>
        </div>
      )}
    </div>
  );
}
