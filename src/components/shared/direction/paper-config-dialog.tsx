"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, BookOpen, Hash, Globe, Quote } from "lucide-react";

// ==================== 预设选项 ====================

const WORD_COUNT_PRESETS = [
  { value: "4000-6000", label: "4,000–6,000 字（短综述/快报）" },
  { value: "6000-8000", label: "6,000–8,000 字（中文核心期刊）" },
  { value: "8000-12000", label: "8,000–12,000 字（学位论文章节/SCI 综述）" },
  { value: "12000-20000", label: "12,000–20,000 字（长篇综述）" },
];

const CITATION_STYLES = [
  { value: "gbt7714", label: "GB/T 7714（中文期刊标准）" },
  { value: "apa7", label: "APA 7.0" },
  { value: "vancouver", label: "Vancouver（生物/医学）" },
  { value: "ieee", label: "IEEE（工程/CS）" },
] as const;

// ==================== 类型 ====================

export interface PaperConfig {
  paperTitle: string;
  paperType: "review" | "research";
  targetJournal: string;
  wordCount: string;
  language: "zh" | "en";
  citationStyle: "gbt7714" | "vancouver" | "apa7" | "ieee";
}

interface PaperConfigDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (config: PaperConfig) => void;
  /** 预填默认值 */
  defaults: {
    paperTitle: string;
    paperType?: "review" | "research";
    targetJournal?: string;
    suggestedJournals?: string[];
    referenceCount?: number;
  };
}

// ==================== 组件 ====================

export function PaperConfigDialog({
  open,
  onCancel,
  onConfirm,
  defaults,
}: PaperConfigDialogProps) {
  const [paperType, setPaperType] = useState<"review" | "research">(
    defaults.paperType || "review",
  );
  const [targetJournal, setTargetJournal] = useState(
    defaults.targetJournal || "",
  );
  const [wordCount, setWordCount] = useState("8000-12000");
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [citationStyle, setCitationStyle] = useState<"gbt7714" | "vancouver" | "apa7" | "ieee">("gbt7714");

  const handleConfirm = () => {
    onConfirm({
      paperTitle: defaults.paperTitle,
      paperType,
      targetJournal: targetJournal.trim(),
      wordCount,
      language,
      citationStyle,
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-[#1a5632]" />
            写作配置确认
          </DialogTitle>
          <DialogDescription className="text-xs">
            确认论文的基本配置后将创建写作项目。这些参数会影响 AI 的写作深度、引用密度和章节结构。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 论文标题（只读） */}
          <div className="space-y-1.5">
            <Label className="text-xs text-[#6b7c72]">论文标题</Label>
            <p className="text-sm font-medium text-[#122820] leading-snug">
              {defaults.paperTitle}
            </p>
          </div>

          {/* 论文类型 */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-[#9aa8a0]" />
              论文类型
            </Label>
            <div className="flex gap-2">
              <Button
                variant={paperType === "review" ? "default" : "outline"}
                size="sm"
                className={
                  paperType === "review"
                    ? "h-8 text-xs bg-[#1a5632] hover:bg-[#1a5632]/90"
                    : "h-8 text-xs"
                }
                onClick={() => setPaperType("review")}
              >
                综述
              </Button>
              <Button
                variant={paperType === "research" ? "default" : "outline"}
                size="sm"
                className={
                  paperType === "research"
                    ? "h-8 text-xs bg-[#1a5632] hover:bg-[#1a5632]/90"
                    : "h-8 text-xs"
                }
                onClick={() => setPaperType("research")}
              >
                原创研究
              </Button>
            </div>
          </div>

          {/* 目标期刊 */}
          <div className="space-y-1.5">
            <Label htmlFor="cfg-journal" className="text-xs flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-[#9aa8a0]" />
              目标期刊
            </Label>
            <Input
              id="cfg-journal"
              value={targetJournal}
              onChange={(e) => setTargetJournal(e.target.value)}
              placeholder="如：Soil Biology & Biochemistry"
              className="h-8 text-xs"
            />
            {defaults.suggestedJournals && defaults.suggestedJournals.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {defaults.suggestedJournals.slice(0, 3).map((j) => (
                  <button
                    key={j}
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a5632]/8 text-[#1a5632] hover:bg-[#1a5632]/15"
                    onClick={() => setTargetJournal(j)}
                  >
                    {j}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 目标字数 */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-[#9aa8a0]" />
              目标字数
            </Label>
            <Select value={wordCount} onValueChange={(v) => { if (v) setWordCount(v); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORD_COUNT_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 写作语言 */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-[#9aa8a0]" />
              写作语言
            </Label>
            <div className="flex gap-2">
              <Button
                variant={language === "zh" ? "default" : "outline"}
                size="sm"
                className={
                  language === "zh"
                    ? "h-8 text-xs bg-[#1a5632] hover:bg-[#1a5632]/90"
                    : "h-8 text-xs"
                }
                onClick={() => setLanguage("zh")}
              >
                中文
              </Button>
              <Button
                variant={language === "en" ? "default" : "outline"}
                size="sm"
                className={
                  language === "en"
                    ? "h-8 text-xs bg-[#1a5632] hover:bg-[#1a5632]/90"
                    : "h-8 text-xs"
                }
                onClick={() => setLanguage("en")}
              >
                英文
              </Button>
            </div>
          </div>

          {/* 引用格式 */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Quote className="h-3.5 w-3.5 text-[#9aa8a0]" />
              引用格式
            </Label>
            <Select
              value={citationStyle}
              onValueChange={(v) => setCitationStyle(v as typeof citationStyle)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CITATION_STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 预加载文献提示 */}
          {defaults.referenceCount != null && defaults.referenceCount > 0 && (
            <div className="rounded-md bg-[#1a5632]/5 px-3 py-2">
              <p className="text-xs text-[#1a5632]">
                已从方向知识库预加载 {defaults.referenceCount} 篇文献，将自动导入到写作项目的参考文献中。
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-[#1a5632] hover:bg-[#1a5632]/90"
            onClick={handleConfirm}
          >
            确认并开始写作
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
