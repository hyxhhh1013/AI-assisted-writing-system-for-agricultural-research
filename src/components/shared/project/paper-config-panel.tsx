"use client";

import { useEffect, useState } from "react";
import { VenueJournalField, VenueSpecUpdateBanner } from "@/components/shared/venue-journal-field";
import { useVenueAlign } from "@/hooks/use-venue-align";
import {
  CHART_PRESET_OPTIONS,
  TEMPLATE_CITATION_MAP,
  TEMPLATE_OPTIONS,
  isChartPresetId,
  isPaperTemplateId,
} from "@/lib/venues/registry";
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
    template: existing?.template || (isPaperTemplateId(project.template || "") ? project.template as PaperConfig["template"] : "sci"),
    chartPreset: existing?.chartPreset && isChartPresetId(existing.chartPreset) ? existing.chartPreset : "nature",
  };
}

interface PaperConfigPanelProps {
  project: ProjectData;
  config?: PaperConfigRecord;
  saving?: boolean;
  /** Direction Handoff 项目：只读，回方向页修改 */
  readOnly?: boolean;
  /** 保存按钮文案，默认「保存配置」；Agent 检查点可用「保存并继续」 */
  saveLabel?: string;
  onSave: (config: PaperConfigRecord) => Promise<void>;
}

/** 工作台内嵌论文配置（Handoff 后为只读摘要） */
export function PaperConfigPanel({
  project,
  config: existing,
  saving = false,
  readOnly = false,
  saveLabel = "保存配置",
  onSave,
}: PaperConfigPanelProps) {
  const [draft, setDraft] = useState(() => configFromProject(project, existing));
  const venue = useVenueAlign();

  useEffect(() => {
    setDraft(configFromProject(project, existing));
    // 按字段回填。把整个 project 放进依赖会在父组件每次渲染时冲掉未保存编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.title, project.mode, project.language, project.citationStyle, project.template, existing]);

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
        <p className="text-xs font-semibold text-[#1a5632]">
          {readOnly ? "P0 · 论文配置（只读）" : "P0 · 论文配置"}
        </p>
        <p className="text-[10px] text-[#6b7c72]">
          {readOnly
            ? "已在方向备料层完成，请回 Direction 修改"
            : "影响 AI 写作深度、引用密度与章节结构"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">论文标题</Label>
        <Input
          className="h-8 text-xs"
          value={draft.paperTitle}
          disabled={readOnly}
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
              disabled={readOnly}
              onClick={() => setDraft((d) => ({ ...d, paperType: type }))}
            >
              {type === "review" ? "综述" : "原创研究"}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">目标期刊</Label>
        <VenueJournalField
          id={`paper-config-journal-${project.id}`}
          className="h-8 text-xs"
          value={draft.targetJournal}
          disabled={readOnly}
          placeholder="如：Applied Soil Ecology"
          onChange={(value) => {
            setDraft((d) => {
              const next = venue.align({
                language: d.language,
                template: d.template || "sci",
                citationStyle: d.citationStyle,
                chartPreset: d.chartPreset && isChartPresetId(d.chartPreset) ? d.chartPreset : "nature",
              }, value);
              return {
                ...d,
                targetJournal: value,
                language: next.language,
                template: isPaperTemplateId(next.template) ? next.template : d.template,
                citationStyle: next.citationStyle,
                chartPreset: next.chartPreset,
              };
            });
          }}
        />
        <VenueSpecUpdateBanner
          journal={draft.targetJournal}
          current={{
            language: draft.language,
            template: draft.template || "sci",
            citationStyle: draft.citationStyle,
            chartPreset: draft.chartPreset && isChartPresetId(draft.chartPreset) ? draft.chartPreset : "nature",
          }}
          onApply={(suggestion) => {
            venue.clear();
            setDraft((d) => ({
              ...d,
              language: suggestion.language,
              template: suggestion.template,
              citationStyle: suggestion.citationStyle,
              chartPreset: suggestion.chartPreset,
            }));
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">目标字数</Label>
        <Select
          value={draft.wordCount}
          disabled={readOnly}
          onValueChange={(v) => v && setDraft((d) => ({ ...d, wordCount: v }))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WORD_COUNT_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
            {draft.wordCount && !WORD_COUNT_PRESETS.some((p) => p.value === draft.wordCount) ? (
              <SelectItem value={draft.wordCount} className="text-xs">
                {draft.wordCount} 字
              </SelectItem>
            ) : null}
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
                disabled={readOnly}
                onClick={() => { venue.mark("language"); setDraft((d) => ({ ...d, language: lang })); }}
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
            disabled={readOnly}
            onValueChange={(v) => {
              if (v !== "gbt7714" && v !== "vancouver" && v !== "apa7" && v !== "ieee") return;
              venue.mark("citationStyle");
              setDraft((d) => ({ ...d, citationStyle: v }));
            }}
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

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">期刊格式模板</Label>
          <Select
            value={draft.template || "sci"}
            disabled={readOnly}
            onValueChange={(val) => {
              if (!val || !isPaperTemplateId(val)) return;
              venue.mark("template");
              venue.mark("citationStyle");
              setDraft((d) => ({ ...d, template: val, citationStyle: TEMPLATE_CITATION_MAP[val] }));
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEMPLATE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value} className="text-xs">{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">图表预设</Label>
          <Select
            value={draft.chartPreset || "nature"}
            disabled={readOnly}
            onValueChange={(val) => {
              if (!val || !isChartPresetId(val)) return;
              venue.mark("chartPreset");
              setDraft((d) => ({ ...d, chartPreset: val }));
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CHART_PRESET_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value} className="text-xs">{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!readOnly && (
        <Button
          type="button"
          size="sm"
          className="h-8 w-full text-xs"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          {saveLabel}
        </Button>
      )}
    </div>
  );
}
