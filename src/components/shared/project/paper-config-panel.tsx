"use client";

import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PaperConfigRecord } from "@/contracts/paper-passport";
import type { ProjectData } from "@/contracts/project";
import { paperConfigToRecord } from "@/contracts/paper-passport";
import type { PaperConfig } from "@/components/shared/direction/paper-config-dialog";

const WORD_COUNT_PRESETS = [
  { value: "4000-6000", label: "4,000–6,000 字" },
  { value: "6000-8000", label: "6,000–8,000 字" },
  { value: "8000-12000", label: "8,000–12,000 字" },
  { value: "12000-20000", label: "12,000–20,000 字" },
];

const CITATION_STYLES = [
  { value: "gbt7714", label: "GB/T 7714" },
  { value: "apa7", label: "APA 7.0" },
  { value: "vancouver", label: "Vancouver" },
  { value: "ieee", label: "IEEE" },
] as const;

function configFromProject(project: ProjectData, existing?: PaperConfigRecord): PaperConfig {
  return {
    paperTitle: existing?.paperTitle || project.title || "",
    paperType: existing?.paperType || (project.mode === "research" ? "research" : "review"),
    targetJournal: existing?.targetJournal || "",
    wordCount: existing?.wordCount || "8000-12000",
    language: existing?.language || (project.language === "en" ? "en" : "zh"),
    citationStyle: existing?.citationStyle || project.citationStyle || "gbt7714",
  };
}

interface PaperConfigPanelProps {
  project: ProjectData;
  config?: PaperConfigRecord;
  saving?: boolean;
  onSave: (config: PaperConfig) => Promise<void>;
}

/** 工作台内嵌 Phase 0 论文配置（写入 passport.config） */
export function PaperConfigPanel({
  project,
  config: existing,
  saving = false,
  onSave,
}: PaperConfigPanelProps) {
  const [draft, setDraft] = useState(() => configFromProject(project, existing));

  useEffect(() => {
    setDraft(configFromProject(project, existing));
  }, [project.id, project.title, project.mode, project.language, project.citationStyle, existing]);

  const handleSave = async () => {
    if (!draft.paperTitle.trim()) {
      toast.error("请填写论文标题");
      return;
    }
    await onSave(paperConfigToRecord(draft));
  };

  return (
    <div className="space-y-3 rounded-lg border border-[#1a5632]/15 bg-[#f6f5f1]/40 p-3">
      <div>
        <p className="text-xs font-semibold text-[#1a5632]">P0 · 论文配置</p>
        <p className="text-[10px] text-[#6b7c72]">影响 AI 写作深度、引用密度与章节结构</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">论文标题</Label>
        <Input
          className="h-8 text-xs"
          value={draft.paperTitle}
          onChange={(e) => setDraft((d) => ({ ...d, paperTitle: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">论文类型</Label>
        <div className="flex gap-2">
          {(["review", "research"] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant={draft.paperType === type ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px] flex-1"
              onClick={() => setDraft((d) => ({ ...d, paperType: type }))}
            >
              {type === "review" ? "综述" : "原创研究"}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">目标期刊</Label>
        <Input
          className="h-8 text-xs"
          value={draft.targetJournal}
          onChange={(e) => setDraft((d) => ({ ...d, targetJournal: e.target.value }))}
          placeholder="如：Applied Soil Ecology"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">目标字数</Label>
        <Select value={draft.wordCount} onValueChange={(v) => v && setDraft((d) => ({ ...d, wordCount: v }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WORD_COUNT_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">语言</Label>
          <div className="flex gap-1">
            {(["zh", "en"] as const).map((lang) => (
              <Button
                key={lang}
                type="button"
                variant={draft.language === lang ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px] flex-1"
                onClick={() => setDraft((d) => ({ ...d, language: lang }))}
              >
                {lang === "zh" ? "中文" : "英文"}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">引用格式</Label>
          <Select
            value={draft.citationStyle}
            onValueChange={(v) => v && setDraft((d) => ({ ...d, citationStyle: v as PaperConfig["citationStyle"] }))}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITATION_STYLES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="h-8 w-full text-xs"
        disabled={saving}
        onClick={() => void handleSave()}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
        保存配置
      </Button>
    </div>
  );
}
