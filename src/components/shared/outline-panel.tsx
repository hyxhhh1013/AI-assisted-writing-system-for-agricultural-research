"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Copy, Save, Languages } from "lucide-react";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface OutlinePanelProps {
  projectId: string;
  project: ProjectData;
  onSave?: (updates: Partial<ProjectData>) => void;
  onTabChange?: (tab: "structure" | "analysis" | "outline" | "writing" | "reader") => void;
}

export function OutlinePanel({ projectId, project, onSave, onTabChange }: OutlinePanelProps) {
  const [title, setTitle] = useState(project.title || "");
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [language, setLanguage] = useState("zh");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(project.outline || "");

  useEffect(() => {
    // 同步来自项目的最新数据（仅在项目 ID 变化时）
    setTitle(project.title || "");
    setResearchDirection(project.researchDirection || "");
    setResult(project.outline || "");
  }, [project.id]);

  const handleSaveProject = (customOutline?: string) => {
    if (!projectId) return;
    
    const updates = {
      title,
      researchDirection,
      outline: customOutline ?? result,
    };
    
    // 不再直接操作 projectStore.save，统一交给父组件 handleUpdateProject 处理
    if (onSave) onSave(updates);
    return updates;
  };

  const handleApplyAndContinue = () => {
    handleSaveProject();
    if (onTabChange) {
      onTabChange("writing");
      toast.success("已保存并进入段落扩写阶段");
    }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, researchDirection, language }),
      });

      if (!response.ok) throw new Error("生成失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResult = "";

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
                const content = data.choices?.[0]?.delta?.content || "";
                fullResult += content;
                setResult(fullResult);
              } catch (e) {}
            }
          }
        }
      }
      
      // 生成完成后自动保存到项目
      handleSaveProject(fullResult);
      toast.success("大纲生成完毕并已自动保存");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 pb-10">
        <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">论文大纲生成</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            生成的是<strong>论证提纲/目录树</strong>（多级标题），供侧栏扩写拆任务使用；与左侧「IMRaD
            五段」不是同一套结构，不会自动替换五段正文。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-xs">拟定论文题目</Label>
            <Input
              id="title"
              placeholder="例如：碳基肥对盐碱地水稻产量的影响研究"
              className="text-xs"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="direction" className="text-xs">研究方向/关键词</Label>
            <Textarea
              id="direction"
              placeholder="请详细描述您的研究方向、实验对象及核心指标..."
              className="text-xs min-h-[80px]"
              value={researchDirection}
              onChange={(e) => setResearchDirection(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">输出语言</Label>
            <Select onValueChange={(val) => setLanguage(val || "zh")} value={language}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="选择语言" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh" className="text-xs">中文 (Chinese)</SelectItem>
                <SelectItem value="en" className="text-xs">英文 (English)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter>
          <Button size="sm" className="w-full text-xs" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Send className="mr-2 h-3 w-3" />}
            开始生成
          </Button>
        </CardFooter>
      </Card>

      {result && (
        <Card className="bg-muted/30 flex flex-col min-h-[300px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 border-b">
            <CardTitle className="text-sm font-medium">生成结果</CardTitle>
            <div className="flex gap-1">
              <Button 
                variant="default" 
                size="sm" 
                className="h-7 text-[10px] bg-green-600 hover:bg-green-700" 
                onClick={handleApplyAndContinue}
              >
                应用并扩写
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                handleSaveProject();
                toast.success("大纲及项目信息已保存");
              }}>
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                navigator.clipboard.writeText(result);
                toast.success("已复制");
              }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-4">
            <div className="text-[11px] leading-relaxed prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
