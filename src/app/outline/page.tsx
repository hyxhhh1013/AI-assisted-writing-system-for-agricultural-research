"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Copy, BookOpen, Save, Languages, Layout } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function OutlinePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">正在加载...</div>}>
      <OutlineContent />
    </Suspense>
  );
}

function OutlineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  const [title, setTitle] = useState("");
  const [researchDirection, setResearchDirection] = useState("");
  const [language, setLanguage] = useState("zh");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");

  // 初始化时加载已有项目数据
  useEffect(() => {
    const init = async () => {
      if (!projectId) {
        const currentId = projectStore.getCurrentId();
        if (currentId) {
          router.replace(`/outline?id=${currentId}`);
        } else {
          router.replace("/projects");
        }
        return;
      }

      const data = await projectStore.get(projectId);
      if (data) {
        if (data.title) setTitle(data.title);
        if (data.researchDirection) setResearchDirection(data.researchDirection);
        if (data.outline) setResult(data.outline);
      }
    };
    init();
  }, [projectId]);

  const handleSaveProject = async () => {
    if (!projectId) {
      toast.error("请先在项目中心创建或选择一个项目");
      return;
    }
    const data = await projectStore.get(projectId);
    if (!data) return;
    
    await projectStore.save({
      ...data,
      title,
      researchDirection,
      outline: result,
    });
    toast.success("大纲已保存到项目");
  };

  const handleGoToWriting = async () => {
    await handleSaveProject();
    // 将大纲存入 sessionStorage，工作台 WritingPanel 可立即读取
    try { sessionStorage.setItem("pending_outline", result); } catch {}
    router.push(`/workbench?id=${projectId}&tab=writing`);
  };

  const handleGenerate = async () => {
    if (!title || !researchDirection) {
      toast.error("请填写完整信息");
      return;
    }

    setIsGenerating(true);
    setResult("");

    try {
      const response = await fetch("/api/outline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, researchDirection, language }),
      });

      if (!response.ok) {
        throw new Error("生成失败，请检查配置或重试");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          
          // 最后一行可能不完整，保留到下一次处理
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === "data: [DONE]") continue;
            
            if (trimmedLine.startsWith("data:")) {
              try {
                const jsonStr = trimmedLine.slice(5).trim();
                const data = JSON.parse(jsonStr);
                const content = data.choices[0]?.delta?.content || "";
                setResult((prev) => prev + content);
              } catch (e) {
                console.error("Error parsing streaming chunk:", e, "Line:", trimmedLine);
              }
            }
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    toast.success("已复制到剪贴板");
  };

  return (
    <>
      <PageHeader
        title="论文大纲生成"
        subtitle="输入研究题目与方向，结合实验室知识库生成结构化大纲"
        icon={BookOpen}
      />

      <div className="grid grid-cols-1 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>论文大纲生成</CardTitle>
            <CardDescription>
              输入您的研究题目和方向，系统将结合实验室知识库为您生成专业大纲。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">拟定论文题目</Label>
              <Input
                id="title"
                placeholder="例如：碳基肥对盐碱地水稻产量的影响研究"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direction">研究方向/关键词</Label>
              <Textarea
                id="direction"
                placeholder="请详细描述您的研究方向、实验对象及核心指标..."
                className="min-h-[100px]"
                value={researchDirection}
                onChange={(e) => setResearchDirection(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>输出语言</Label>
              <Select onValueChange={(val) => setLanguage(val || "zh")} value={language}>
                <SelectTrigger>
                  <SelectValue placeholder="选择语言" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文 (Chinese)</SelectItem>
                  <SelectItem value="en">英文 (English)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在生成专业大纲...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> 开始生成
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {result && (
          <Card className="bg-muted/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">生成结果</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveProject}>
                  <Save className="mr-2 h-4 w-4" /> 保存草稿
                </Button>
                <Button variant="default" size="sm" onClick={handleGoToWriting}>
                  <BookOpen className="mr-2 h-4 w-4" /> 开始扩写章节
                </Button>
                <Button variant="outline" size="icon" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
