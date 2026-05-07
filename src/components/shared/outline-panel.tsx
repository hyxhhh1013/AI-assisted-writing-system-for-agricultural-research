"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, FileText } from "lucide-react";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";

interface OutlinePanelProps {
  projectId: string;
  project: ProjectData;
  onSave?: (updates: Partial<ProjectData>) => void;
  onTabChange?: (tab: "structure" | "analysis" | "outline" | "writing" | "reader") => void;
}

export function OutlinePanel({ projectId, project, onSave }: OutlinePanelProps) {
  const [title, setTitle] = useState(project.title || "");
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [language, setLanguage] = useState("zh");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(project.outline || "");

  useEffect(() => {
    setTitle(project.title || "");
    setResearchDirection(project.researchDirection || "");
    setResult(project.outline || "");
  }, [project.id]);

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
        body: JSON.stringify({ title, researchDirection, language }),
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
      toast.success("大纲生成完毕");
    } catch (e: any) { toast.error(e.message); }
    finally { setIsGenerating(false); }
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
        <div className="flex justify-end gap-1">
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
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {!result && !isGenerating && (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">填写论文信息后生成大纲</p>
          </div>
        )}

        {isGenerating && (
          <div className="text-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
            <p className="text-sm">正在生成大纲...</p>
          </div>
        )}

        {result && (
          <div className="text-xs leading-relaxed whitespace-pre-wrap font-mono bg-muted/20 rounded p-3 border max-h-full overflow-y-auto">
            {result}
          </div>
        )}
      </div>
    </div>
  );
}
