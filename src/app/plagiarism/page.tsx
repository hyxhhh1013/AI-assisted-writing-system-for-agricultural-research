"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search, Shuffle, FileText, Loader2, AlertTriangle, CheckCircle2,
  Globe, BookOpen, ArrowLeft, Sparkles, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/lib/store";

// ==== 类型定义 ====
interface MatchResult {
  id: string;
  sourceText: string;
  sourceOffset: number;
  matchType: "self" | "local" | "web" | "cross";
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

// ==== 主页面 ====
export default function PlagiarismPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">正在加载...</div>}>
      <PlagiarismContent />
    </Suspense>
  );
}

function PlagiarismContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  const [project, setProject] = useState<ProjectData | null>(null);
  const [checkTitle, setCheckTitle] = useState("");
  const [checkContent, setCheckContent] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [activeTab, setActiveTab] = useState("check");

  useEffect(() => {
    const init = async () => {
      if (projectId) {
        const data = await projectStore.get(projectId);
        if (data) {
          setProject(data);
          setCheckTitle(data.title || "");
        }
      }
    };
    init();
  }, [projectId]);

  // 运行查重
  const handleCheck = async () => {
    if (!checkContent.trim()) {
      toast.error("请先输入或粘贴要检测的论文内容");
      return;
    }

    setIsChecking(true);
    setResult(null);

    try {
      const res = await fetch("/api/plagiarism/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || undefined,
          title: checkTitle || "未命名检测",
          content: checkContent,
          webSearch,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "查重请求失败");
      }

      const data: CheckResult = await res.json();
      setResult(data);
      setActiveTab("result");
      toast.success("查重完成！");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-14 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 font-semibold">
            <Search className="h-5 w-5 text-primary" />
            论文查重与降重
          </div>
          {project && (
            <span className="text-sm text-muted-foreground ml-auto truncate">
              {project.title}
            </span>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="check" className="gap-2">
              <Search className="h-4 w-4" /> 查重检测
            </TabsTrigger>
            <TabsTrigger value="result" className="gap-2" disabled={!result}>
              <FileText className="h-4 w-4" /> 检测结果
            </TabsTrigger>
            <TabsTrigger value="rewrite" className="gap-2" disabled={!result}>
              <Shuffle className="h-4 w-4" /> AI 降重
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <RefreshCw className="h-4 w-4" /> 历史记录
            </TabsTrigger>
          </TabsList>

          {/* 查重检测页 */}
          <TabsContent value="check">
            <Card>
              <CardHeader>
                <CardTitle>论文查重检测</CardTitle>
                <CardDescription>
                  输入或粘贴论文内容，系统将进行本地知识库比对{webSearch && "和联网学术搜索"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">检测标题</label>
                  <input
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    placeholder="例如：基于深度学习的作物病害检测"
                    value={checkTitle}
                    onChange={(e) => setCheckTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">论文内容</label>
                  <Textarea
                    className="min-h-[300px] font-mono text-sm"
                    placeholder="在此粘贴你要检测的论文内容..."
                    value={checkContent}
                    onChange={(e) => setCheckContent(e.target.value)}
                  />
                  <div className="text-xs text-muted-foreground mt-1 text-right">
                    {checkContent.length} 字符
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webSearch}
                      onChange={(e) => setWebSearch(e.target.checked)}
                      className="rounded"
                    />
                    <Globe className="h-4 w-4" />
                    联网查重（Semantic Scholar + CrossRef）
                  </label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => { setCheckContent(""); setResult(null); }}>
                  清空
                </Button>
                <Button onClick={handleCheck} disabled={isChecking || !checkContent.trim()}>
                  {isChecking ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 检测中...</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> 开始查重</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* 检测结果页 */}
          <TabsContent value="result">
            {result && <ResultPanel result={result} />}
          </TabsContent>

          {/* 降重页 */}
          <TabsContent value="rewrite">
            {result && <RewritePanel checkId={result.checkId} matches={result.matches} />}
          </TabsContent>

          {/* 历史记录页 */}
          <TabsContent value="history">
            <HistoryPanel projectId={projectId} onViewResult={(r) => { setResult(r); setActiveTab("result"); }} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ==== 查重结果面板 ====
function ResultPanel({ result }: { result: CheckResult }) {
  const riskColor = result.overallRisk === "high" ? "text-red-500" : result.overallRisk === "medium" ? "text-yellow-500" : "text-green-500";
  const riskBg = result.overallRisk === "high" ? "bg-red-50" : result.overallRisk === "medium" ? "bg-yellow-50" : "bg-green-50";

  return (
    <div className="space-y-6">
      {/* 总体概况 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            检测结果概览
            <Badge variant={result.overallRisk === "high" ? "destructive" : result.overallRisk === "medium" ? "default" : "secondary"}>
              {result.overallRisk === "high" ? "高风险" : result.overallRisk === "medium" ? "中风险" : "低风险"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className={`p-4 rounded-lg ${riskBg}`}>
              <div className={`text-2xl font-bold ${riskColor}`}>
                {(result.maxSimilarity * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground">最高相似度</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{result.totalMatches}</div>
              <div className="text-sm text-muted-foreground">匹配段落数</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{result.matches.filter(m => m.matchType === "web").length}</div>
              <div className="text-sm text-muted-foreground">联网匹配</div>
            </div>
          </div>
          <Progress value={result.maxSimilarity * 100} className="h-2" />
        </CardContent>
      </Card>

      {/* 匹配详情 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">匹配详情</CardTitle>
          <CardDescription>共发现 {result.totalMatches} 处相似内容</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {result.matches.map((match, i) => (
                <MatchCard key={match.id} match={match} index={i} />
              ))}
              {result.matches.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>未发现明显的相似内容</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ==== 单个匹配卡片 ====
function MatchCard({ match, index }: { match: MatchResult; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const riskBadge = match.riskLevel === "high"
    ? <Badge variant="destructive">高危</Badge>
    : match.riskLevel === "medium"
    ? <Badge variant="default">中危</Badge>
    : <Badge variant="secondary">低危</Badge>;

  const typeIcon = match.matchType === "web"
    ? <Globe className="h-3 w-3" />
    : <BookOpen className="h-3 w-3" />;

  return (
    <div className="border rounded-lg p-4 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          #{index + 1} {typeIcon}
          <span className="text-muted-foreground">
            {match.matchType === "web" ? "联网匹配" : "本地库匹配"}
          </span>
          {riskBadge}
          <Badge variant="outline">{(match.similarity * 100).toFixed(0)}%</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      <div className="text-sm">
        <span className="font-medium text-muted-foreground">匹配来源：</span>
        {match.matchedUrl ? (
          <a href={match.matchedUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {match.matchedFrom}
          </a>
        ) : (
          <span>{match.matchedFrom}</span>
        )}
      </div>

      {expanded && (
        <div className="space-y-2 pt-2 border-t">
          <div>
            <div className="text-xs text-muted-foreground mb-1">原文段落：</div>
            <div className="text-sm bg-red-50 dark:bg-red-950/30 p-2 rounded border border-red-200 dark:border-red-800">
              {match.sourceText}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">匹配内容：</div>
            <div className="text-sm bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded border border-yellow-200 dark:border-yellow-800">
              {match.matchedText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==== 降重改写面板 ====
function RewritePanel({ checkId, matches }: { checkId: string; matches: MatchResult[] }) {
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

  if (matches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
          <p className="text-muted-foreground">没有需要降重的内容</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 降重改写
          </CardTitle>
          <CardDescription>
            选择需要降重的段落，AI 会生成多种改写方案供你选择确认
          </CardDescription>
        </CardHeader>
      </Card>

      {matches.filter(m => m.riskLevel !== "low").map((match, i) => (
        <Card key={match.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                段落 #{i + 1}
                <Badge variant={match.riskLevel === "high" ? "destructive" : "default"}>
                  {(match.similarity * 100).toFixed(0)}% 重复
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRewrite(match)}
                disabled={rewriting === match.id}
              >
                {rewriting === match.id ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 生成中</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" /> AI 降重</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm p-3 bg-red-50 dark:bg-red-950/30 rounded border text-muted-foreground">
              {match.sourceText}
            </div>

            {suggestions[match.id] && (
              <div className="space-y-2">
                {suggestions[match.id].map((s, si) => (
                  <div key={si} className="p-3 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {s.strategy === "synonym" ? "同义替换" :
                         s.strategy === "rephrase" ? "改写语序" :
                         s.strategy === "summarize" ? "概括精简" : "扩写重组"}
                      </Badge>
                    </div>
                    <p className="text-sm">{s.suggestedText}</p>
                  </div>
                ))}
                <div className="text-xs text-muted-foreground text-center pt-1">
                  AI 生成建议，请人工核对后使用
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ==== 历史记录面板 ====
function HistoryPanel({ projectId, onViewResult }: { projectId?: string | null; onViewResult: (r: CheckResult) => void }) {
  const [checks, setChecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (projectId) params.append("projectId", projectId);
        const res = await fetch(`/api/plagiarism/history?${params}`);
        const data = await res.json();
        setChecks(data.checks || []);
      } catch { setChecks([]); }
      finally { setLoading(false); }
    };
    fetchHistory();
  }, [projectId]);

  const loadCheck = async (checkId: string) => {
    try {
      const res = await fetch(`/api/plagiarism/history?checkId=${checkId}`);
      const data = await res.json();
      if (data.check) {
        onViewResult({
          checkId: data.check.id,
          totalMatches: data.check._count?.matches || 0,
          maxSimilarity: data.check.maxSimilarity || 0,
          overallRisk: (data.check.overallRisk || "low") as "high" | "medium" | "low",
          matches: data.check.matches?.map((m: any) => ({
            id: m.id, sourceText: m.sourceText, sourceOffset: m.sourceOffset,
            matchType: m.matchType, matchedText: m.matchedText,
            matchedFrom: m.matchedFrom, matchedUrl: m.matchedUrl,
            similarity: m.similarity, riskLevel: m.riskLevel,
          })) || [],
        });
      }
    } catch { toast.error("加载检测详情失败"); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (checks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>暂无查重记录</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {checks.map((c: any) => {
        const riskColor = c.maxSimilarity > 0.35 ? "destructive" : c.maxSimilarity > 0.15 ? "default" : "secondary";
        const riskLabel = c.maxSimilarity > 0.35 ? "高风险" : c.maxSimilarity > 0.15 ? "中风险" : "低风险";
        return (
          <Card key={c.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => loadCheck(c.id)}>
            <CardHeader className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">{c.title}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {new Date(c.createdAt).toLocaleString("zh-CN")}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={riskColor}>{riskLabel}</Badge>
                  <span className="text-sm font-mono">{(c.maxSimilarity * 100).toFixed(1)}%</span>
                </div>
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
