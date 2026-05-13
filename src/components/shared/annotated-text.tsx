"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverPopup,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trash2, Highlighter, X, ChevronUp, ChevronDown, Palette } from "lucide-react";
import type { Annotation } from "@/lib/annotations-store";
import {
  addAnnotation,
  deleteAnnotation,
  COLOR_CLASSES,
} from "@/lib/annotations-store";

interface AnnotatedTextProps {
  text: string;
  filename: string;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
}

const COLORS = [
  { key: "yellow", label: "黄", class: "bg-yellow-300" },
  { key: "green", label: "绿", class: "bg-green-300" },
  { key: "blue", label: "蓝", class: "bg-blue-300" },
  { key: "pink", label: "粉", class: "bg-pink-300" },
] as const;

export function AnnotatedText({
  text,
  filename,
  annotations,
  onAnnotationsChange,
}: AnnotatedTextProps) {
  const [selectedColor, setSelectedColor] = useState<"yellow" | "green" | "blue" | "pink">("yellow");
  const [noteDraft, setNoteDraft] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  // 构建标注片段：将原文按标注边界拆分，标注段落用高亮 span 包裹
  const segments = useMemo(() => {
    if (!annotations.length || !text) {
      return [{ text, annotation: null }];
    }

    // 按标注的 text 在原文中的位置排序
    const positions: { start: number; end: number; annotation: Annotation }[] = [];
    for (const ann of annotations) {
      let idx = 0;
      while (idx < text.length) {
        const found = text.indexOf(ann.text, idx);
        if (found === -1) break;
        // 避免同一段文字被多个标注覆盖 — 检查是否与已有 position 重叠
        const overlaps = positions.some(
          p => found < p.end && found + ann.text.length > p.start,
        );
        if (!overlaps) {
          positions.push({ start: found, end: found + ann.text.length, annotation: ann });
        }
        idx = found + 1;
      }
    }
    positions.sort((a, b) => a.start - b.start);

    // 构建分段
    const result: { text: string; annotation: Annotation | null }[] = [];
    let cursor = 0;
    for (const pos of positions) {
      if (pos.start > cursor) {
        result.push({ text: text.slice(cursor, pos.start), annotation: null });
      }
      result.push({ text: text.slice(pos.start, pos.end), annotation: pos.annotation });
      cursor = pos.end;
    }
    if (cursor < text.length) {
      result.push({ text: text.slice(cursor), annotation: null });
    }
    return result;
  }, [text, annotations]);

  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    const selected = sel.toString().trim();
    if (selected.length < 3) return;
    setPendingText(selected);
    setShowNoteInput(true);
  }, []);

  const handleAddAnnotation = () => {
    if (!pendingText) return;
    const ann = addAnnotation(filename, {
      text: pendingText,
      note: noteDraft,
      color: selectedColor,
    });
    onAnnotationsChange([...annotations, ann]);
    setPendingText("");
    setNoteDraft("");
    setShowNoteInput(false);
    window.getSelection()?.removeAllRanges();
  };

  const handleDelete = (id: string) => {
    deleteAnnotation(filename, id);
    onAnnotationsChange(annotations.filter(a => a.id !== id));
    setActiveAnnotationId(null);
  };

  const handleNavigate = (direction: -1 | 1) => {
    if (!annotations.length) return;
    const currentIdx = activeAnnotationId
      ? annotations.findIndex(a => a.id === activeAnnotationId)
      : -1;
    const nextIdx = currentIdx < 0
      ? 0
      : (currentIdx + direction + annotations.length) % annotations.length;
    setActiveAnnotationId(annotations[nextIdx].id);
    // 滚动到对应元素
    const el = document.getElementById(`ann-${annotations[nextIdx].id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-3">
      {/* 标注工具栏 */}
      {annotations.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border">
          <Highlighter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">
            {annotations.length} 条标注
          </span>
          <div className="flex items-center ml-auto gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleNavigate(-1)}
              disabled={annotations.length === 0}
              title="上一条标注"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleNavigate(1)}
              disabled={annotations.length === 0}
              title="下一条标注"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* 文本渲染区域 */}
      <div
        className="p-4 bg-primary/5 border border-primary/10 rounded-lg text-sm leading-relaxed text-foreground/90 shadow-sm relative"
        onMouseUp={handleTextSelection}
      >
        {segments.map((seg, i) =>
          seg.annotation ? (
            <Popover key={i}>
              <PopoverTrigger
                id={`ann-${seg.annotation.id}`}
                className={cn(
                  COLOR_CLASSES[seg.annotation.color] || COLOR_CLASSES.yellow,
                  "cursor-pointer rounded-sm px-0.5 transition-colors hover:opacity-80 inline border-0 bg-transparent text-inherit text-sm font-inherit",
                  activeAnnotationId === seg.annotation.id && "ring-2 ring-primary/50",
                )}
              >
                {seg.text}
              </PopoverTrigger>
              <PopoverPopup className="w-72">
                <div className="space-y-3 p-1">
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold text-muted-foreground">标注笔记</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(seg.annotation!.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-2 bg-muted/30 rounded text-xs leading-relaxed">
                    {seg.annotation.note || "(无笔记)"}
                  </div>
                  <div className="text-[10px] text-muted-foreground border-t pt-2">
                    标注文本："{seg.annotation.text.slice(0, 50)}{seg.annotation.text.length > 50 ? "..." : ""}"
                  </div>
                </div>
              </PopoverPopup>
            </Popover>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>

      {/* 新增标注弹窗 */}
      {showNoteInput && pendingText && (
        <div className="p-3 bg-background border rounded-lg shadow-lg space-y-3 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">新增标注</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setShowNoteInput(false);
                setPendingText("");
                setNoteDraft("");
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="p-2 bg-muted/30 rounded text-xs italic">
            &ldquo;{pendingText.slice(0, 80)}{pendingText.length > 80 ? "..." : ""}&rdquo;
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">颜色：</span>
            {COLORS.map(c => (
              <button
                key={c.key}
                onClick={() => setSelectedColor(c.key)}
                className={cn(
                  "w-5 h-5 rounded-full border-2 transition-all",
                  c.class,
                  selectedColor === c.key ? "border-primary scale-110" : "border-transparent opacity-60 hover:opacity-100",
                )}
                title={c.label}
              />
            ))}
          </div>
          <Textarea
            placeholder="添加笔记（可选）..."
            className="min-h-[60px] text-xs"
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => {
              setShowNoteInput(false);
              setPendingText("");
              setNoteDraft("");
            }}>
              取消
            </Button>
            <Button size="sm" className="text-xs h-7" onClick={handleAddAnnotation}>
              <Highlighter className="h-3 w-3 mr-1" /> 保存标注
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
