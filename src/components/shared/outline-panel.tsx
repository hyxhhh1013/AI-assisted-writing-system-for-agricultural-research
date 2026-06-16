"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, FileText, ChevronRight, PenTool, CheckCircle2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { ProjectData } from "@/contracts/project";
import {
  parseWritingBlueprint,
  serializeWritingBlueprint,
  type WritingBlueprint,
} from "@/contracts/writing-blueprint";
import { listKnowledgeFiles } from "@/services/knowledge";
import { resolveOutlineResearchDirection, streamOutline } from "@/services/outline";
import { generateWritingBlueprint } from "@/services/blueprint";
import { parseOutline, OutlineSection } from "@/lib/utils";
import { countFiguresForSection } from "@/lib/blueprint-utils";
import { OutlineBlueprintSummary } from "@/components/shared/outline-blueprint-summary";
import { OutlineBlueprintDialog } from "@/components/shared/outline-blueprint-dialog";

interface OutlinePanelProps {
  projectId: string;
  project: ProjectData;
  onSave?: (updates: Partial<ProjectData>) => void;
  onTabChange?: (tab: "structure" | "data" | "outline" | "writing" | "reader" | "plagiarism" | "xrd") => void;
  expandedSections?: string[];
  onExpandTask?: (taskId: string) => void;
}

export function OutlinePanel({ projectId, project, onSave, onTabChange, expandedSections, onExpandTask }: OutlinePanelProps) {
  const isReview = (project.mode ?? "review") === "review";
  const [title, setTitle] = useState(project.title || "");
  const [researchDirection, setResearchDirection] = useState(project.researchDirection || "");
  const [language, setLanguage] = useState("zh");
  const [category, setCategory] = useState("全部");
  const [categories, setCategories] = useState<string[]>(["全部"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBlueprintGenerating, setIsBlueprintGenerating] = useState(false);
  const [blueprintDialogOpen, setBlueprintDialogOpen] = useState(false);
  const [result, setResult] = useState(project.outline || "");

  const blueprint = useMemo(
    () => parseWritingBlueprint(project.writingBlueprint),
    [project.writingBlueprint],
  );

  useEffect(() => {
    setTitle(project.title || "");
    setResearchDirection(project.researchDirection || "");
    setResult(project.outline || "");
  }, [project.id, project.title, project.researchDirection, project.outline]);

  useEffect(() => {
    listKnowledgeFiles()
      .then(d => {
        if (d.categories) {
          setCategories(["全部", ...d.categories.filter(c => c !== "全部")]);
        }
      })
      .catch(() => {});
  }, []);

  const outlineTasks = useMemo(() => parseOutline(result), [result]);

  const figureCountByTask = useMemo(() => {
    if (!blueprint) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const task of outlineTasks) {
      const count = countFiguresForSection(task.fullPath, blueprint.figurePlan.items);
      if (count > 0) map.set(task.id, count);
    }
    return map;
  }, [blueprint, outlineTasks]);

  const handleSave = useCallback((customOutline?: string, customBlueprint?: WritingBlueprint | null) => {
    if (!projectId) return;
    const effectiveDirection = resolveOutlineResearchDirection(title, researchDirection);
    const updates: Partial<ProjectData> = {
      title,
      researchDirection: effectiveDirection,
      outline: customOutline ?? result,
    };
    if (customBlueprint !== undefined) {
      updates.writingBlueprint = customBlueprint
        ? serializeWritingBlueprint(customBlueprint)
        : undefined;
    }
    onSave?.(updates);
  }, [projectId, title, researchDirection, result, onSave]);

  const handleGenerateBlueprint = useCallback(async () => {
    const effectiveTitle = title.trim();
    const effectiveDirection = resolveOutlineResearchDirection(title, researchDirection);
    const outlineText = result.trim();

    if (!effectiveTitle) {
      toast.error("请填写论文题目");
      return;
    }
    if (!outlineText) {
      toast.error("请先生成或填写大纲");
      return;
    }

    setIsBlueprintGenerating(true);
    try {
      const next = await generateWritingBlueprint({
        title: effectiveTitle,
        outline: outlineText,
        researchDirection: effectiveDirection,
        language: language as "zh" | "en",
        projectMode: project.mode ?? "review",
      });
      handleSave(undefined, next);
      toast.success(`写作蓝图已生成：预计 ${next.figurePlan.totalMin}–${next.figurePlan.totalMax} 张图`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "蓝图生成失败");
    } finally {
      setIsBlueprintGenerating(false);
    }
  }, [title, researchDirection, result, language, project.mode, handleSave]);

  const handleGenerate = async () => {
    const effectiveTitle = title.trim();
    const effectiveDirection = resolveOutlineResearchDirection(title, researchDirection);
    if (!effectiveTitle) {
      toast.error("请填写论文题目");
      return;
    }
    if (!effectiveDirection) {
      toast.error(isReview ? "请填写综述主题或关键词" : "请填写研究方向");
      return;
    }

    setIsGenerating(true);
    setResult("");
    try {
      const full = await streamOutline(
        {
          title: effectiveTitle,
          researchDirection: effectiveDirection,
          language: language as "zh" | "en",
          category,
          projectMode: project.mode ?? "review",
        },
        setResult,
      );
      handleSave(full, null);
      toast.success("大纲生成完毕，可生成写作蓝图后再扩写");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExpandTask = (task: OutlineSection) => {
    onExpandTask?.(task.id);
    onTabChange?.("writing");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 p-3 border-b bg-card space-y-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">论文题目</Label>
          <Input
            className="text-xs h-8 mt-0.5"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={isReview ? "如：生物炭改良盐碱地研究进展" : "碳基肥对盐碱地水稻产量的影响"}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">
            {isReview ? "综述主题 / 关键词" : "关键词 / 研究方向"}
          </Label>
          <Textarea
            className="text-xs h-12 min-h-[2rem] mt-0.5"
            value={researchDirection}
            onChange={e => setResearchDirection(e.target.value)}
            placeholder={
              isReview
                ? "综述范围、主题维度、争议点；留空时将使用论文题目检索文献"
                : "研究方向、实验对象、核心指标，越详细大纲越精准"
            }
          />
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
        </div>
      </div>

      <OutlineBlueprintSummary
        blueprint={blueprint}
        isGenerating={isBlueprintGenerating}
        hasOutline={Boolean(result.trim())}
        onGenerate={handleGenerateBlueprint}
        onOpenDetail={() => setBlueprintDialogOpen(true)}
      />

      <OutlineBlueprintDialog
        open={blueprintDialogOpen}
        onOpenChange={setBlueprintDialogOpen}
        blueprint={blueprint}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!result && !isGenerating && (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{isReview ? "填写综述题目后生成主题式大纲" : "填写论文信息后生成大纲"}</p>
            <p className="text-[10px] mt-1">生成大纲后可生成写作蓝图，再点击章节扩写</p>
          </div>
        )}

        {isGenerating && (
          <div className="text-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
            <p className="text-sm">正在生成{isReview ? "综述" : ""}大纲...</p>
          </div>
        )}

        {outlineTasks.length > 0 && (
          <div className="p-2 space-y-1">
            <p className="text-[10px] text-muted-foreground px-2 py-1 uppercase tracking-wider">点击章节开始扩写</p>
            {outlineTasks.map((task, i) => {
              const figCount = figureCountByTask.get(task.id);
              return (
                <button
                  key={task.id || i}
                  onClick={() => handleExpandTask(task)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between group hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20"
                  style={{ paddingLeft: `${8 + task.level * 12}px` }}
                >
                  <span className="truncate flex-1 min-w-0">{task.title}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {figCount != null && figCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
                        title={`规划 ${figCount} 张配图`}
                      >
                        <ImageIcon className="h-3 w-3" />
                        {figCount}
                      </span>
                    )}
                    {expandedSections?.includes(task.id) && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    )}
                    <PenTool className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {result && (
        <div className="p-2 border-t space-y-1.5 shrink-0">
          <Label className="text-[10px] text-muted-foreground uppercase">编辑大纲文本</Label>
          <Textarea
            className="text-xs min-h-[80px] max-h-40 font-mono bg-muted/20"
            value={result}
            onChange={e => setResult(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] w-full"
            onClick={() => {
              handleSave();
              toast.success("大纲已保存");
            }}
          >
            保存修改
          </Button>
        </div>
      )}
    </div>
  );
}
