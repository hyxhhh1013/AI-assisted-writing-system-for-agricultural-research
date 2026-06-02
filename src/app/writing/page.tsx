"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Copy, Eraser, FileText, Database, ScrollText, PenTool } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { toast } from "sonner";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import { buildSectionOptions } from "@/lib/imrad";
import { postWritingStream } from "@/services/writing";
import { getErrorMessage } from "@/lib/error-utils";
import { workbenchFallback } from "@/lib/navigation";

const SECTIONS = buildSectionOptions();

export default function WritingPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">正在加载...</div>}>
      <WritingContent />
    </Suspense>
  );
}

function WritingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  const [project, setProject] = useState<ProjectData | null>(null);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("");
  const [language, setLanguage] = useState("zh");
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");

  // 加载项目数据
  useEffect(() => {
    const init = async () => {
      if (!projectId) {
        const currentId = projectStore.getCurrentId();
        if (currentId) {
          router.replace(`/writing?id=${currentId}`);
        } else {
          router.replace("/projects");
        }
        return;
      }

      const data = await projectStore.get(projectId);
      if (data) {
        setProject(data);
        if (data.title) setTitle(data.title);
      }
    };
    init();
  }, [projectId]);

  const injectOutline = () => {
    if (project?.outline) {
      setContext((prev) => prev + (prev ? "\n\n" : "") + "【大纲参考】：\n" + project.outline);
      toast.success("已将大纲内容注入上下文");
    }
  };

  const injectAnalysis = () => {
    if (project?.analysisResults && project.analysisResults.length > 0) {
      const latest = project.analysisResults[project.analysisResults.length - 1];
      setContext((prev) => prev + (prev ? "\n\n" : "") + "【实验数据分析结论】：\n" + latest);
      toast.success("已将最新数据分析结果注入上下文");
    } else {
      toast.error("暂无已保存的数据分析结果");
    }
  };

  const handleGenerate = async () => {
    if (!title || !section || !context) {
      toast.error("请填写完整信息（题目、章节、研究上下文）");
      return;
    }

    setIsGenerating(true);
    setResult("");

    try {
      const response = await postWritingStream({
        title,
        section: section as "abstract" | "introduction" | "methods" | "results" | "conclusion",
        context,
        language: language as "zh" | "en",
        template: project?.template || "sci",
        existingReferences: project?.references || [],
        researchDirection: project?.researchDirection,
      });

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
                setResult((prev) => prev + content);
              } catch (e) {
                console.error("Parse error:", e);
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
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
        title="模块化扩写"
        subtitle="选择章节与上下文，基于本地知识库进行学术化扩写"
        icon={PenTool}
        backHref={workbenchFallback(projectId)}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* 输入面板 */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>模块化扩写</CardTitle>
            <CardDescription>
              选择具体论文章节，输入您的核心观点或粗略数据，系统将基于本地知识库进行专业学术化扩写。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">论文题目</Label>
              <Input
                id="title"
                placeholder="拟定的论文题目"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="section">目标章节</Label>
              <Select onValueChange={(val) => setSection(val || "")} value={section}>
                <SelectTrigger>
                  <SelectValue placeholder="选择要扩写的章节" />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="context">研究内容/上下文信息</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={injectOutline}
                    disabled={!project?.outline}
                  >
                    <ScrollText className="mr-1 h-3 w-3" /> 注入大纲
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={injectAnalysis}
                    disabled={!project?.analysisResults?.length}
                  >
                    <Database className="mr-1 h-3 w-3" /> 注入分析结果
                  </Button>
                </div>
              </div>
              <Textarea
                id="context"
                placeholder="请输入该章节的核心内容、实验数据或您的初步想法。信息越详细，扩写质量越高。"
                className="min-h-[200px]"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex gap-4">
            <Button variant="outline" className="flex-1" onClick={() => {
              setTitle(""); setSection(""); setContext(""); setResult("");
            }}>
              <Eraser className="mr-2 h-4 w-4" /> 重置
            </Button>
            <Button className="flex-[2]" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在撰写中...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> 开始扩写
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* 结果展示面板 */}
        <Card className="flex flex-col h-full min-h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between border-b py-4">
            <div>
              <CardTitle className="text-lg">AI 生成内容</CardTitle>
              <CardDescription>生成的文本将自动参考本地热化学文献库</CardDescription>
            </div>
            {result && (
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="mr-2 h-3 w-3" /> 复制全文
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-6">
            {result ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-sm">
                {result}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic">
                <FileText className="h-12 w-12 mb-4 opacity-20" />
                等待输入并点击“开始扩写”...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
