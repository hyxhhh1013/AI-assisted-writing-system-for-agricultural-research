"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, Languages, Loader2, Copy, Sparkles, 
  BookOpen, Search, RefreshCw, ChevronLeft, ChevronRight 
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 动态导入 PDFViewer，关闭 SSR 以避免 pdfjs-dist 的 Node.js 依赖问题
const PDFViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

function ReaderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filename = searchParams.get("file");
  const [pdfUrl, setPdfUrl] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [translation, setTranslation] = useState("");
  const [translationHistory, setTranslationHistory] = useState<string[]>([]);
  const [currentTranslationIndex, setCurrentTranslationIndex] = useState(-1);
  const [isTranslating, setIsTranslating] = useState(false);

  // 文献分析相关状态
  const [activeTab, setActiveTab] = useState("translate");
  const [analysisResult, setAnalysisResult] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"full" | "chunk">("full");
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current && isAnalyzing) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [analysisResult, isAnalyzing]);

  useEffect(() => {
    if (filename) {
      setPdfUrl(`/api/pdf?file=${encodeURIComponent(filename)}`);
    }
  }, [filename]);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString().trim();
      if (text && text.length > 2) {
        setSelectedText(text);
        // 如果在分析选项卡，且没有分析结果，或者用户主动选择了文本，自动切换到翻译选项卡
        if (activeTab !== "translate") {
          setActiveTab("translate");
        }
      }
    }
  };

  const handleTranslate = async () => {
    if (!selectedText) return;
    setIsTranslating(true);
    setTranslation("");

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedText, targetLang: "zh" }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        let fullTranslation = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === "data: [DONE]") continue;
            
            if (trimmedLine.startsWith("data:")) {
              try {
                const data = JSON.parse(trimmedLine.slice(5).trim());
                const content = data.choices[0]?.delta?.content || "";
                fullTranslation += content;
                setTranslation(fullTranslation);
              } catch (e) {
                console.error("Error parsing translation chunk:", e);
              }
            }
          }
        }
        // 添加到历史记录
        setTranslationHistory(prev => [fullTranslation, ...prev.slice(0, 9)]);
        setCurrentTranslationIndex(0);
      }
    } catch (error) {
      toast.error("翻译失败");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAnalyze = async (chunkIdx = 0, modeOverride?: "full" | "chunk") => {
    if (!filename) return;
    const mode = modeOverride || analysisMode;
    setIsAnalyzing(true);
    setAnalysisResult("");
    setCurrentChunk(chunkIdx);
    setAnalysisMode(mode);

    try {
      const response = await fetch("/api/knowledge/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, chunkIndex: chunkIdx, mode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "分析失败");
      }

      // 获取分页信息
      const total = response.headers.get('X-Total-Chunks');
      if (total) setTotalChunks(parseInt(total));
      const respMode = response.headers.get('X-Analysis-Mode') as "full" | "chunk";
      if (respMode) setAnalysisMode(respMode);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

            if (trimmedLine.startsWith("data:")) {
              try {
                const data = JSON.parse(trimmedLine.slice(5).trim());
                const content = data.choices[0]?.delta?.content || "";
                setAnalysisResult((prev) => prev + content);
              } catch (e) {
                console.error("Error parsing analysis chunk:", e);
              }
            }
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!filename) return <div>未找到文件</div>;

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-3 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/knowledge")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> 返回
          </Button>
          <h1 className="font-semibold text-sm truncate max-w-[400px]">{filename}</h1>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* PDF 展示区 */}
        <div className="flex-1 border-r bg-muted/30 relative overflow-hidden" onMouseUp={handleTextSelection}>
          {pdfUrl ? (
            <PDFViewer fileUrl={pdfUrl} onPageChange={setCurrentPage} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* 辅助区 */}
        <aside className="w-[450px] flex flex-col bg-card border-l shrink-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col min-h-0">
            <div className="px-4 pt-4 shrink-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="translate" className="gap-2">
                  <Languages className="h-3.5 w-3.5" /> 划词翻译
                </TabsTrigger>
                <TabsTrigger value="analysis" className="gap-2">
                  <Sparkles className="h-3.5 w-3.5" /> 文献洞察
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 relative mt-2">
              <TabsContent value="translate" className="flex-1 flex flex-col h-full m-0 data-[state=active]:flex overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 bg-card z-10">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                      <Languages className="h-3.5 w-3.5 text-primary" /> 翻译历史
                    </Label>
                    {translationHistory.length > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        记录 {currentTranslationIndex + 1} / {translationHistory.length}
                      </span>
                    )}
                  </div>
                  {translationHistory.length > 1 && (
                    <div className="flex items-center border rounded-md h-7 overflow-hidden">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-full w-7 rounded-none border-r"
                        disabled={currentTranslationIndex === translationHistory.length - 1}
                        onClick={() => {
                          const newIdx = currentTranslationIndex + 1;
                          setCurrentTranslationIndex(newIdx);
                          setTranslation(translationHistory[newIdx]);
                        }}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-full w-7 rounded-none"
                        disabled={currentTranslationIndex <= 0}
                        onClick={() => {
                          const newIdx = currentTranslationIndex - 1;
                          setCurrentTranslationIndex(newIdx);
                          setTranslation(translationHistory[newIdx]);
                        }}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
                  <div className="p-4 space-y-6">
                    <div className="space-y-3">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">选中原文</Label>
                      <div className="p-4 bg-muted/50 rounded-lg text-sm min-h-[120px] whitespace-pre-wrap leading-relaxed border border-dashed">
                        {selectedText || "在左侧划词以进行翻译..."}
                      </div>
                      {selectedText && (
                        <Button size="sm" className="w-full h-9 text-xs font-bold shadow-sm" onClick={handleTranslate} disabled={isTranslating}>
                          {isTranslating ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Languages className="h-3.5 w-3.5 mr-2" />}
                          立即翻译
                        </Button>
                      )}
                    </div>

                    {translation && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">AI 翻译 (DeepSeek)</Label>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            navigator.clipboard.writeText(translation);
                            toast.success("已复制翻译内容");
                          }}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg text-sm leading-relaxed text-foreground/90 shadow-sm">
                          {translation}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="analysis" className="flex-1 flex flex-col h-full m-0 data-[state=active]:flex overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 bg-card z-10">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> 
                      {analysisMode === "full" ? "整篇文献深度分析" : "文献片段分析报告"}
                    </Label>
                    <div className="flex items-center gap-2">
                      {analysisMode === "chunk" && totalChunks > 1 && (
                        <span className="text-[10px] text-muted-foreground">
                          第 {currentChunk + 1} / {totalChunks} 部分
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">
                        PDF 第 {currentPage} 页
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {analysisMode === "chunk" && totalChunks > 1 && (
                      <div className="flex items-center mr-2 border rounded-md h-7 overflow-hidden">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-full w-7 rounded-none border-r"
                          disabled={currentChunk === 0 || isAnalyzing}
                          onClick={() => handleAnalyze(currentChunk - 1, "chunk")}
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-full w-7 rounded-none"
                          disabled={currentChunk >= totalChunks - 1 || isAnalyzing}
                          onClick={() => handleAnalyze(currentChunk + 1, "chunk")}
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {analysisResult && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        navigator.clipboard.writeText(analysisResult);
                        toast.success("已复制分析结果");
                      }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isAnalyzing}>
                          <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                        </Button>
                      } />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleAnalyze(0, "full")}>
                          重新进行整篇解析
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAnalyze(0, "chunk")}>
                          切换为分段解析模式
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto scroll-smooth" 
                  style={{ 
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch"
                  }}
                >
                  <div className="p-4 min-h-full">
                    {!analysisResult && !isAnalyzing ? (
                      <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-60">
                        <div className="p-4 rounded-full bg-primary/10">
                          <BookOpen className="h-8 w-8 text-primary" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-sm font-bold">文献整篇深度洞察</h3>
                          <p className="text-xs max-w-[280px]">AI 将自动阅读并理解整篇文献，为您全方位提取核心目标、研究发现及逻辑脉络。</p>
                        </div>
                        <div className="flex flex-col gap-2 w-full max-w-[200px]">
                          <Button size="sm" onClick={() => handleAnalyze(0, "full")} className="gap-2">
                            <Sparkles className="h-4 w-4" /> 开始整篇解析
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleAnalyze(0, "chunk")} className="gap-2 text-[10px]">
                            分段解析 (针对超长文献)
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="prose prose-sm prose-slate dark:prose-invert max-w-none pb-8">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {analysisResult}
                        </ReactMarkdown>
                        {isAnalyzing && (
                          <div className="flex items-center gap-2 text-primary text-xs font-medium animate-pulse mt-4">
                            <Loader2 className="h-3 w-3 animate-spin" /> AI 正在深度思考并梳理脉络...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin" /></div>}>
      <ReaderContent />
    </Suspense>
  );
}
