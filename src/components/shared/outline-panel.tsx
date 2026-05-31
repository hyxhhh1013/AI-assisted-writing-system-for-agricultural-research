"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, FileText, ChevronRight, PenTool, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import { parseOutline, OutlineSection } from "@/lib/utils";

interface OutlinePanelProps {
  projectId: string;
  project: ProjectData;
  onSave?: (updates: Partial<ProjectData>) => void;
  onTabChange?: (tab: "structure" | "data" | "outline" | "writing" | "reader" | "plagiarism" | "xrd") => void;
  expandedSections?: string[];
  onExpandTask?: (taskId: string) => void;
}

export function OutlinePanel({ projectId, project, onSave, onTabChange, expandedSections, onExpandTask }: OutlinePanelProps) {
  const [title, setTitle] = useState(project.title || "");
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [language, setLanguage] = useState("zh");
  const [category, setCategory] = useState("全部");
  const [categories, setCategories] = useState<string[]>(["全部"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(project.outline || "");

  useEffect(() => {
    setTitle(project.title || "");
    setResearchDirection(project.researchDirection || "");
    setResult(project.outline || "");
  }, [project.id, project.title, project.researchDirection]);

  useEffect(() => {
    fetch("/api/knowledge")
      .then(r => r.json())
      .then(d => { if (d.categories) setCategories(["全部", ...d.categories.filter((c: string) => c !== "全部")]); })
      .catch(() => {});
  }, []);

  // 解析大纲为结构化任务列表
  const outlineTasks = useMemo(() => parseOutline(result), [result]);

  const handleSave = (customOutline?: string) => {
    if (!projectId) return;
    if (onSave) onSave({ title, researchDirection, outline: customOutline ?? result });
  };

  const handleGenerate = async () => {
    if (!title || !researchDirection) { toast.error("请填写论文题目和研究方向"); return; }
    setIsGenerating(true);
    setResult("");
    try {
      const res = await fetch("/api/outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, researchDirection, language, category }),
      });
      if (!res.ok) throw new Error("生成失败");
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (!t || t === "data: [DONE]") continue;
            if (t.startsWith("data:")) {
              try {
                const d = JSON.parse(t.slice(5).trim());
                full += d.choices?.[0]?.delta?.content || "";
                setResult(full);
              } catch {}
            }
          }
        }
      }
      handleSave(full);
      toast.success("大纲生成完毕，点击章节可跳转到扩写");
    } catch (e: any) { toast.error(e.message); }
    finally { setIsGenerating(false); }
  };

  // 点击大纲章节 → 通过回调通知父组件跳转到扩写面板
  const handleExpandTask = (task: OutlineSection) => {
    onExpandTask?.(task.id);
    onTabChange?.("writing");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 表单区 */}
      <div className="shrink-0 p-3 border-b bg-card space-y-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">论文题目</Label>
          <Input className="text-xs h-8 mt-0.5" value={title}
            onChange={e => setTitle(e.target.value)} placeholder="碳基肥对盐碱地水稻产量的影响" />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">关键词 / 研究方向</Label>
          <Textarea className="text-xs h-12 min-h-[2rem] mt-0.5" value={researchDirection}
            onChange={e => setResearchDirection(e.target.value)}
            placeholder="研究方向、实验对象、核心指标，越详细大纲越精准" />
        </div>
        <div className="flex justify-between items-center gap-1">
          <Select value={category} onValueChange={v => v && setCategory(v)}>
            <SelectTrigger className="text-xs h-7 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Select value={language} onValueChange={v => v && setLanguage(v)}>
              <SelectTrigger className="text-xs h-7 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">EN</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-7 text-xs" disabled={isGenerating} onClick={handleGenerate}>
            {isGenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            生成
          </Button>
        </div>
        </>
      }
    >
      {/* 大纲任务列表 — 点击即可跳转到扩写 */}
        {!result && !isGenerating && (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">填写论文信息后生成大纲</p>
            <p className="text-[10px] mt-1">生成后可点击章节直接跳转到扩写面板</p>
          </div>
        )}

        {isGenerating && (
          <div className="text-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
            <p className="text-sm">正在生成大纲...</p>
          </div>
        )}

        {outlineTasks.length > 0 && (
          <div className="p-2 space-y-1">
            <p className="text-[10px] text-muted-foreground px-2 py-1 uppercase tracking-wider">点击章节开始扩写</p>
            {outlineTasks.map((task, i) => (
              <button
                key={task.id || i}
                onClick={() => handleExpandTask(task)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between group hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20"
                style={{ paddingLeft: `${8 + task.level * 12}px` }}
              >
                <span className="truncate flex-1 min-w-0">{task.title}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {expandedSections?.includes(task.id) && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  )}
                  <PenTool className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 原始大纲编辑区 */}
        {result && (
          <div className="p-2 border-t space-y-1.5 shrink-0">
            <Label className="text-[10px] text-muted-foreground uppercase">编辑大纲文本</Label>
            <Textarea
              className="text-xs min-h-[80px] max-h-40 font-mono bg-muted/20"
              value={result}
              onChange={e => setResult(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-6 text-[10px] w-full"
              onClick={() => { handleSave(); toast.success("大纲已保存"); }}>
              保存修改
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
