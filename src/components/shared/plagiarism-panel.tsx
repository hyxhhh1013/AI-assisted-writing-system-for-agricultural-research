"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search, Shuffle, Loader2, AlertTriangle, CheckCircle2,
  Globe, BookOpen, Sparkles, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";

interface MatchResult {
  id: string;
  sourceText: string;
  sourceOffset: number;
  matchType: "local" | "web" | "cross";
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
}

interface PlagiarismPanelProps {
  projectId?: string;
  projectTitle?: string;
  /** 预填内容（如从当前编辑区获取） */
  initialContent?: string;
}

export function PlagiarismPanel({ projectId, projectTitle, initialContent }: PlagiarismPanelProps) {
  const [checkTitle] = useState(projectTitle || "");
  const [checkContent, setCheckContent] = useState(initialContent || "");
  const [webSearch, setWebSearch] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [view, setView] = useState<"check" | "result" | "rewrite">("check");

  const handleCheck = useCallback(async () => {
    if (!checkContent.trim()) {
      toast.error("请先输入或粘贴要检测的论文内容");
      return;
    }

    if (checkContent.length > 100000) {
      toast.error("内容过长，请控制在 10 万字以内");
      return;
    }

    setIsChecking(true);
    setResult(null);
    setCheckStatus("正在提取文本指纹...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      setCheckStatus("正在进行本地库比对（长文本会采样分析）...");

      const res = await fetch("/api/plagiarism/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: checkTitle || "未命名检测",
          content: checkContent,
          webSearch,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "查重请求失败" }));
        throw new Error(err.error || `查重失败 (${res.status})`);
      }

      const data: CheckResult = await res.json();
      setResult(data);
      setView("result");
      toast.success(`查重完成！共发现 ${data.totalMatches} 处匹配`);
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast.error("查重超时，请分段检测");
      } else {
        toast.error(err.message);
      }
    } finally {
      setIsChecking(false);
      setCheckStatus("");
    }
  }, [checkContent, checkTitle, projectId, webSearch]);

  // 查重输入视图
  if (view === "check") {
    return (
      <div className="space-y-3">
        <Textarea
          className="min-h-[200px] font-mono text-sm"
          placeholder="粘贴你要检测的论文内容..."
          value={checkContent}
          onChange={(e) => setCheckContent(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => setWebSearch(e.target.checked)}
              className="rounded"
            />
            <Globe className="h-4 w-4" />
            联网搜索
          </label>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setCheckContent(""); setResult(null); }}>
              清空
            </Button>
            <Button size="sm" onClick={handleCheck} disabled={isChecking || !checkContent.trim()}>
              {isChecking ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {checkStatus || "检测中"}</>
              ) : (
                <><Search className="h-4 w-4 mr-1" /> 开始查重</>
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{checkContent.length} 字符</p>
      </div>
    );
  }

  if (!result) return null;

  // 结果视图
  if (view === "result") {
    const riskColor = result.overallRisk === "high" ? "text-red-500" : result.overallRisk === "medium" ? "text-yellow-500" : "text-green-500";
    const riskBg = result.overallRisk === "high" ? "bg-red-50" : result.overallRisk === "medium" ? "bg-yellow-50" : "bg-green-50";

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className={`p-3 rounded-lg ${riskBg} text-center`}>
            <div className={`text-xl font-bold ${riskColor}`}>
              {(result.maxSimilarity * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">最高相似度</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold">{result.totalMatches}</div>
            <div className="text-xs text-muted-foreground">匹配段落</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold">{result.matches.filter(m => m.matchType === "web").length}</div>
            <div className="text-xs text-muted-foreground">联网匹配</div>
          </div>
        </div>
        <Progress value={result.maxSimilarity * 100} className="h-1.5" />

        {result.matches.length > 0 ? (
          <ScrollArea className="max-h-[320px]">
            <div className="space-y-2">
              {result.matches.map((match, i) => (
                <MatchItem key={match.id} match={match} index={i} />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">未发现明显相似内容</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("check")}>
            <RefreshCw className="h-3 w-3 mr-1" /> 重新检测
          </Button>
          {result.matches.length > 0 && (
            <Button size="sm" onClick={() => setView("rewrite")}>
              <Shuffle className="h-3 w-3 mr-1" /> AI 降重
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 降重视图
  return (
    <RewriteView
      checkId={result.checkId}
      matches={result.matches}
      onBack={() => setView("result")}
    />
  );
}

// ==== 匹配项 ====
function MatchItem({ match, index }: { match: MatchResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const riskBadge = match.riskLevel === "high"
    ? <Badge variant="destructive">高危</Badge>
    : match.riskLevel === "medium"
    ? <Badge>中危</Badge>
    : <Badge variant="secondary">低危</Badge>;

  return (
    <div className="border rounded-lg p-3 space-y-1.5 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          #{index + 1} {riskBadge}
          <Badge variant="outline" className="text-xs">{(match.similarity * 100).toFixed(0)}%</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {match.matchType === "web" ? "🌐 " : "📚 "} {match.matchedFrom}
      </div>
      {expanded && (
        <div className="space-y-1.5 pt-1.5 border-t text-xs">
          <div className="p-1.5 bg-red-50 dark:bg-red-950/30 rounded border">{match.sourceText.slice(0, 150)}</div>
          <div className="p-1.5 bg-yellow-50 dark:bg-yellow-950/30 rounded border">{match.matchedText.slice(0, 150)}</div>
        </div>
      )}
    </div>
  );
}

// ==== 降重面板 ====
function RewriteView({
  checkId, matches, onBack
}: {
  checkId: string; matches: MatchResult[]; onBack: () => void;
}) {
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, RewriteSuggestion[]>>({});

  const handleRewrite = async (match: MatchResult) => {
    setRewriting(match.id);
    try {
      const res = await fetch("/api/plagiarism/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkId,
          matchId: match.id,
          originalText: match.sourceText,
        }),
      });
      if (!res.ok) throw new Error("改写请求失败");
      const data = await res.json();
      setSuggestions((prev) => ({ ...prev, [match.id]: data.suggestions }));
      toast.success("改写建议已生成");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRewriting(null);
    }
  };

  const highRisk = matches.filter(m => m.riskLevel !== "low");

  if (highRisk.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
        <p className="text-sm text-muted-foreground">没有需要降重的内容</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onBack}>返回结果</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        AI 降重改写
      </div>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-3">
          {highRisk.map((match, i) => (
            <div key={match.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">段落 #{i + 1}</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRewrite(match)} disabled={rewriting === match.id}>
                  {rewriting === match.id
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 生成中</>
                    : <><Sparkles className="h-3 w-3 mr-1" /> 降重</>
                  }
                </Button>
              </div>
              <div className="text-xs p-2 bg-red-50 dark:bg-red-950/30 rounded border text-muted-foreground">
                {match.sourceText.slice(0, 200)}
              </div>
              {suggestions[match.id]?.map((s, si) => (
                <div key={si} className="text-xs p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200">
                  <Badge variant="outline" className="text-[10px] mb-1">
                    {s.strategy === "synonym" ? "同义替换" :
                     s.strategy === "rephrase" ? "改写语序" :
                     s.strategy === "summarize" ? "概括精简" : "扩写重组"}
                  </Badge>
                  <p>{s.suggestedText}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
      <Button variant="outline" size="sm" onClick={onBack}>返回结果</Button>
    </div>
  );
}
