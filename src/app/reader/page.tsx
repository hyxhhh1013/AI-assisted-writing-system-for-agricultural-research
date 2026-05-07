"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Languages, Loader2, Copy, Sparkles,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { ChatPanel } from "@/components/shared/chat-panel";
import { AnnotatedText } from "@/components/shared/annotated-text";
import { loadAnnotations, type Annotation } from "@/lib/annotations-store";

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

  const [activeTab, setActiveTab] = useState("chat");
  const [currentPage, setCurrentPage] = useState(1);
  // 标注状态
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // 加载标注（按文件名分组）
  useEffect(() => {
    if (filename) {
      setAnnotations(loadAnnotations(filename));
    }
  }, [filename]);

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
                <TabsTrigger value="chat" className="gap-2">
                  <Sparkles className="h-3.5 w-3.5" /> 文献对话
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
                        <AnnotatedText
                          text={translation}
                          filename={filename || "unknown"}
                          annotations={annotations}
                          onAnnotationsChange={setAnnotations}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="chat" className="flex-1 flex flex-col h-full m-0 data-[state=active]:flex overflow-hidden">
                {filename ? (
                  <ChatPanel filename={filename} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    正在加载文献...
                  </div>
                )}
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
