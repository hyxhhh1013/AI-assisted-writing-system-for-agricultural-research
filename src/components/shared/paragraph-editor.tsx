"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Sparkles, FileText, Trash2, Plus, 
  GripVertical, ChevronUp, ChevronDown,
  RefreshCw, Check, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  ParagraphSelectionToolbar,
  type ParagraphSelectionAction,
} from "@/components/shared/writing/paragraph-selection-toolbar";

interface ParagraphEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  onExpand?: (paragraphContent: string, index: number) => Promise<string>;
  onAudit?: (paragraphContent: string) => Promise<string>;
  onFix?: (paragraphContent: string, feedback: string) => Promise<string>;
  onSelectionAction?: (selectedText: string, action: ParagraphSelectionAction) => Promise<string>;
  projectId: string;
  activeSection: string;
}

export function ParagraphEditor({ 
  content, 
  onChange, 
  onExpand, 
  onAudit,
  onFix,
  onSelectionAction,
  projectId,
  activeSection
}: ParagraphEditorProps) {
  // 将内容拆分为段落数组
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [expandingIndex, setExpandingIndex] = useState<number | null>(null);
  const [auditingIndex, setAuditingIndex] = useState<number | null>(null);
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [auditFeedback, setAuditFeedback] = useState<Record<number, string>>({});
  const [selectionUi, setSelectionUi] = useState<{ index: number; start: number; end: number } | null>(null);
  const [selectionBusy, setSelectionBusy] = useState(false);

  // 初始化段落
  useEffect(() => {
    if (content) {
      const splitContent = content.split(/\n\n+/).filter(p => p.trim() !== "");
      setParagraphs(splitContent.length > 0 ? splitContent : [""]);
    } else {
      setParagraphs([""]);
    }
  }, [content, activeSection]);

  // 更新总内容
  const updateTotalContent = useCallback((newParagraphs: string[]) => {
    setParagraphs(newParagraphs);
    onChange(newParagraphs.join("\n\n"));
  }, [onChange]);

  // 修改单个段落
  const handleParagraphChange = (index: number, value: string) => {
    const newParagraphs = [...paragraphs];
    newParagraphs[index] = value;
    updateTotalContent(newParagraphs);
  };

  // 添加段落
  const addParagraph = (index: number) => {
    const newParagraphs = [...paragraphs];
    newParagraphs.splice(index + 1, 0, "");
    updateTotalContent(newParagraphs);
  };

  // 删除段落
  const deleteParagraph = (index: number) => {
    if (paragraphs.length <= 1) {
      handleParagraphChange(0, "");
      return;
    }
    const newParagraphs = paragraphs.filter((_, i) => i !== index);
    updateTotalContent(newParagraphs);
  };

  // 段落上移
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newParagraphs = [...paragraphs];
    [newParagraphs[index - 1], newParagraphs[index]] = [newParagraphs[index], newParagraphs[index - 1]];
    updateTotalContent(newParagraphs);
  };

  // 段落下移
  const moveDown = (index: number) => {
    if (index === paragraphs.length - 1) return;
    const newParagraphs = [...paragraphs];
    [newParagraphs[index + 1], newParagraphs[index]] = [newParagraphs[index], newParagraphs[index + 1]];
    updateTotalContent(newParagraphs);
  };

  // 处理扩写
  const handleExpand = async (index: number) => {
    if (!onExpand || expandingIndex !== null) return;
    
    const text = paragraphs[index];
    if (!text.trim()) {
      toast.error("当前段落内容为空，无法扩写");
      return;
    }

    setExpandingIndex(index);
    toast.info("AI 正在为您深度扩写该段落...");
    
    try {
      const expanded = await onExpand(text, index);
      if (expanded) {
        const newParagraphs = [...paragraphs];
        newParagraphs[index] = expanded;
        updateTotalContent(newParagraphs);
        toast.success("段落扩写完成");
      }
    } catch (e) {
      toast.error("扩写失败，请稍后重试");
    } finally {
      setExpandingIndex(null);
    }
  };

  // 处理审查
  const handleAudit = async (index: number) => {
    if (!onAudit || auditingIndex !== null) return;
    
    const text = paragraphs[index];
    if (!text.trim()) {
      toast.error("当前段落内容为空，无法审查");
      return;
    }

    setAuditingIndex(index);
    toast.info("学术核查代理审计中...");
    
    try {
      const feedback = await onAudit(text);
      if (feedback) {
        setAuditFeedback(prev => ({ ...prev, [index]: feedback }));
        toast.success("审计完成，已发现改进建议");
      }
    } catch (e) {
      toast.error("审计失败");
    } finally {
      setAuditingIndex(null);
    }
  };

  const handleFix = async (index: number) => {
    if (!onFix || !auditFeedback[index] || fixingIndex !== null) return;

    setFixingIndex(index);
    toast.info("正在根据审计建议优化内容...");

    try {
      const fixed = await onFix(paragraphs[index], auditFeedback[index]);
      if (fixed) {
        const newParagraphs = [...paragraphs];
        newParagraphs[index] = fixed;
        updateTotalContent(newParagraphs);
        setAuditFeedback(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        toast.success("内容优化完成");
      }
    } catch (e) {
      toast.error("优化失败");
    } finally {
      setFixingIndex(null);
    }
  };

  const captureSelection = (index: number, el: HTMLTextAreaElement) => {
    if (el.selectionStart !== el.selectionEnd) {
      setSelectionUi({ index, start: el.selectionStart, end: el.selectionEnd });
    } else if (selectionUi?.index === index) {
      setSelectionUi(null);
    }
  };

  const handleSelectionToolbarAction = async (action: ParagraphSelectionAction) => {
    if (!selectionUi || !onSelectionAction || selectionBusy) return;
    const { index, start, end } = selectionUi;
    const para = paragraphs[index] ?? "";
    const selected = para.slice(start, end);
    if (!selected.trim()) {
      toast.error("请先选中有效文本");
      return;
    }

    setSelectionBusy(true);
    const actionLabel =
      action === "expand" ? "扩写" : action === "polish" ? "润色" : action === "shorten" ? "精简" : "审查";
    toast.info(`正在对选区进行${actionLabel}…`);

    try {
      const result = await onSelectionAction(selected, action);
      if (action === "audit") {
        if (result) {
          setAuditFeedback((prev) => ({ ...prev, [index]: `【选区审查】\n${result}` }));
          toast.success("选区审查完成");
        }
      } else if (result) {
        const newParagraphs = [...paragraphs];
        newParagraphs[index] = para.slice(0, start) + result + para.slice(end);
        updateTotalContent(newParagraphs);
        toast.success(`选区${actionLabel}完成`);
      }
    } catch {
      toast.error(`选区${actionLabel}失败`);
    } finally {
      setSelectionBusy(false);
      setSelectionUi(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 pb-32 max-w-4xl mx-auto min-h-full bg-muted/5">
      {paragraphs.map((para, index) => (
        <Card key={`${activeSection}-${index}`} className="group relative border-border/40 shadow-sm hover:shadow-md transition-all duration-300 overflow-visible bg-card/50 backdrop-blur-sm">
          {/* 侧边序号与移动按钮 */}
          <div className="absolute -left-12 top-0 bottom-0 flex flex-col items-center py-4 gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center text-[10px] font-bold bg-background shadow-sm border-primary/20 text-primary">
              {index + 1}
            </Badge>
            <div className="flex flex-col gap-1 bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 p-0.5 shadow-sm">
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => moveUp(index)} disabled={index === 0}>
                <ChevronUp className="h-4 w-4" />
              </Button>
              <div className="h-px bg-border/50 mx-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => moveDown(index)} disabled={index === paragraphs.length - 1}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-primary transition-colors">
              <GripVertical className="h-4 w-4" />
            </div>
          </div>

          <div className="p-1">
            <Textarea
              className="min-h-[120px] w-full border-none focus-visible:ring-0 resize-none p-6 text-base leading-relaxed font-serif bg-transparent placeholder:italic scrollbar-hide"
              placeholder={`在这里输入第 ${index + 1} 段的内容…`}
              value={para}
              onChange={(e) => handleParagraphChange(index, e.target.value)}
              onSelect={(e) => captureSelection(index, e.currentTarget)}
              onMouseUp={(e) => captureSelection(index, e.currentTarget)}
              onKeyUp={(e) => captureSelection(index, e.currentTarget)}
            />
          </div>

          {selectionUi?.index === index && onSelectionAction && (
            <div className="mx-4 mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <ParagraphSelectionToolbar
                disabled={selectionBusy}
                onAction={handleSelectionToolbarAction}
              />
            </div>
          )}

          {/* 审计建议显示区域 */}
          {auditFeedback[index] && (
            <div className="mx-4 mb-4 p-4 rounded-lg bg-amber-50/50 border border-amber-100/50 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">审计建议</span>
                  </div>
                  <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
                    {auditFeedback[index]}
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button 
                    size="sm" 
                    className="h-8 bg-amber-600 hover:bg-amber-700 text-white shadow-sm gap-1.5"
                    onClick={() => handleFix(index)}
                    disabled={fixingIndex === index}
                  >
                    {fixingIndex === index ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    一键采纳
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-amber-700 hover:bg-amber-100/50"
                    onClick={() => {
                      setAuditFeedback(prev => {
                        const next = { ...prev };
                        delete next[index];
                        return next;
                      });
                    }}
                  >
                    忽略
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 段落工具栏 */}
          <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20 rounded-b-lg group-hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 gap-1.5 text-xs text-primary hover:bg-primary/10 font-bold rounded-full px-3"
                onClick={() => handleExpand(index)}
                disabled={expandingIndex === index}
              >
                {expandingIndex === index ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI 扩写
              </Button>
              <div className="w-px h-4 bg-border/50" />
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 gap-1.5 text-xs text-amber-600 hover:bg-amber-50 font-bold rounded-full px-3"
                onClick={() => handleAudit(index)}
                disabled={auditingIndex === index}
              >
                {auditingIndex === index ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                学术审查
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
                onClick={() => addParagraph(index)}
                title="在下方插入新段落"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-full"
                onClick={() => deleteParagraph(index)}
                title="删除此段落"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {/* 底部快速添加按钮 */}
      <Button 
        variant="ghost" 
        className="w-full h-16 border-2 border-dashed border-border/40 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all rounded-2xl group"
        onClick={() => addParagraph(paragraphs.length - 1)}
      >
        <Plus className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
        添加新段落
      </Button>

      <div className="text-center text-[10px] text-muted-foreground uppercase tracking-widest mt-8 pb-10">
        段落块编辑器 · 选区助手 · 学术写作
      </div>
    </div>
  );
}
