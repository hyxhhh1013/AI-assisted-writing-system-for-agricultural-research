"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DIALOG_FULL } from "@/components/ui/dialog-sizes";
import type { AgentEntryModeId } from "@/contracts/paper-passport";
import { parsePaperPassport } from "@/contracts/paper-passport";
import { AGENT_ENTRY_MODES } from "@/lib/agent/entry-mode";
import type { ProjectData, ProjectLanguage } from "@/contracts/project";
import { resolveProjectLanguage } from "@/contracts/project";
import { getWritingModeMeta } from "@/contracts/writing-mode";
import { ProjectModeBadge } from "@/components/shared/project-mode-badge";
import { BilingualAbstractControls } from "@/components/shared/bilingual-abstract-controls";
import { cn } from "@/lib/utils";
import { VenueJournalField, VenueSpecUpdateBanner } from "@/components/shared/venue-journal-field";
import { useVenueAlign } from "@/hooks/use-venue-align";
import {
  CHART_PRESET_OPTIONS,
  TEMPLATE_CITATION_MAP,
  isChartPresetId,
  isPaperTemplateId,
  type ChartPresetId,
} from "@/lib/venues/registry";

interface ProjectMetaDraft {
  title: string;
  authors: string;
  affiliations: string;
  abstract: string;
  keywords: string;
  classification: string;
  researchDirection: string;
  outline: string;
  template: string;
  referencesText: string;
  citationStyle?: "gbt7714" | "vancouver" | "apa7" | "ieee";
  language: ProjectLanguage;
  targetJournal: string;
  wordCount: string;
  agentEntryMode: AgentEntryModeId | "";
  chartPreset: ChartPresetId;
}

interface WorkbenchMetaDialogProps {
  open: boolean;
  onClose: () => void;
  project: ProjectData;
  onSave: (draft: ProjectMetaDraft) => void;
}

/** 模板 → 引用格式的默认映射 */
const WORD_COUNT_PRESETS = [
  { value: "4000-6000", label: "4,000–6,000 字" },
  { value: "6000-8000", label: "6,000–8,000 字" },
  { value: "8000-12000", label: "8,000–12,000 字" },
  { value: "12000-20000", label: "12,000–20,000 字" },
];

function passportDraft(project: ProjectData): Pick<ProjectMetaDraft, "targetJournal" | "wordCount" | "agentEntryMode" | "chartPreset"> {
  const cfg = parsePaperPassport(project.paperPassport ?? null)?.config;
  const mode = cfg?.agentEntryMode;
  return {
    targetJournal: cfg?.targetJournal ?? "",
    wordCount: cfg?.wordCount || "8000-12000",
    agentEntryMode: mode === "full" || mode === "outline_ready" || mode === "data_ready" ? mode : "",
    chartPreset: cfg?.chartPreset && isChartPresetId(cfg.chartPreset) ? cfg.chartPreset : "nature",
  };
}

export function WorkbenchMetaDialog({ open, onClose, project, onSave }: WorkbenchMetaDialogProps) {
  const [tempMeta, setTempMeta] = useState<ProjectMetaDraft>({
    title: project.title || "",
    authors: project.authors || "",
    affiliations: project.affiliations || "",
    abstract: project.abstract || "",
    keywords: project.keywords || "",
    classification: project.classification || "",
    researchDirection: project.researchDirection || "",
    outline: project.outline || "",
    template: project.template || "sci",
    referencesText: (project.references || []).join("\n"),
    citationStyle: project.citationStyle || "gbt7714",
    language: resolveProjectLanguage(project),
    ...passportDraft(project),
  });
  const venue = useVenueAlign();

  useEffect(() => {
    if (open) {
      venue.clear();
      setTempMeta({
        title: project.title || "",
        authors: project.authors || "",
        affiliations: project.affiliations || "",
        abstract: project.abstract || "",
        keywords: project.keywords || "",
        classification: project.classification || "",
        researchDirection: project.researchDirection || "",
        outline: project.outline || "",
        template: project.template || "sci",
        referencesText: (project.references || []).join("\n"),
        citationStyle: project.citationStyle || "gbt7714",
        language: resolveProjectLanguage(project),
        ...passportDraft(project),
      });
    }
    // 只在打开或护照变化时回填，避免项目对象每次渲染冲掉正在编辑的规格
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project.id, project.paperPassport]);

  const handleSave = () => {
    onSave(tempMeta);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={DIALOG_FULL}>
        <DialogHeader className="shrink-0">
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>项目设置</DialogTitle>
            <DialogDescription>
              管理论文元数据、投稿模板、摘要、大纲与参考文献。
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="grid gap-2">
                  <Label htmlFor="meta-title">论文题目</Label>
                  <Input
                    id="meta-title"
                    value={tempMeta.title}
                    onChange={(e) => setTempMeta({ ...tempMeta, title: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-template">期刊格式模板</Label>
                  <Select value={tempMeta.template} onValueChange={(val) => {
                    const tpl = val && isPaperTemplateId(val) ? val : "sci";
                    venue.mark("template");
                    venue.mark("citationStyle");
                    setTempMeta({ ...tempMeta, template: tpl, citationStyle: TEMPLATE_CITATION_MAP[tpl] });
                  }}>
                    <SelectTrigger id="meta-template">
                      <SelectValue placeholder="选择期刊格式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sci">标准 SCI 格式</SelectItem>
                      <SelectItem value="nature">Nature 官方风格</SelectItem>
                      <SelectItem value="ieee">IEEE 会刊格式</SelectItem>
                      <SelectItem value="gbt7713">GB/T 7713</SelectItem>
                      <SelectItem value="cas">中科院期刊风格</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[#1a5632]/15 bg-[#f6f5f1]/60 px-3 py-2">
                <span className="text-xs text-[#6b7c72]">项目类型</span>
                <ProjectModeBadge mode={project.mode} size="md" />
                <span className="text-[11px] text-[#9aa8a0]">
                  {getWritingModeMeta(project.mode).description} · 创建后不可更改
                </span>
              </div>

              <div className="grid gap-2">
                <Label>写作语言</Label>
                <div className="flex h-9 max-w-xs border rounded-md overflow-hidden">
                  <button
                    type="button"
                    className={cn(
                      "flex-1 text-sm transition-colors",
                      tempMeta.language === "zh"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted/60",
                    )}
                    onClick={() => { venue.mark("language"); setTempMeta({ ...tempMeta, language: "zh" }); }}
                  >
                    中文
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex-1 text-sm transition-colors",
                      tempMeta.language === "en"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted/60",
                    )}
                    onClick={() => { venue.mark("language"); setTempMeta({ ...tempMeta, language: "en" }); }}
                  >
                    English
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">影响大纲、写作蓝图与章节扩写的输出语言</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-citation-style">引用格式标准</Label>
                <Select
                  value={tempMeta.citationStyle || "gbt7714"}
                  onValueChange={(val) => {
                    if (val !== "gbt7714" && val !== "vancouver" && val !== "apa7" && val !== "ieee") return;
                    venue.mark("citationStyle");
                    setTempMeta({ ...tempMeta, citationStyle: val });
                  }}
                >
                  <SelectTrigger id="meta-citation-style">
                    <SelectValue placeholder="选择引用格式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gbt7714">GB/T 7714-2015（中文期刊国标）</SelectItem>
                    <SelectItem value="vancouver">Vancouver / SCI 顺序编码制</SelectItem>
                    <SelectItem value="apa7">APA 7th（作者-出版年制）</SelectItem>
                    <SelectItem value="ieee">IEEE（工程类期刊）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">随期刊模板自动选定，也可独立覆盖。影响 AI 生成的参考文献条目格式</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="meta-journal">目标期刊</Label>
                  <VenueJournalField
                    id="meta-journal"
                    value={tempMeta.targetJournal}
                    placeholder="如 Applied Soil Ecology"
                    onChange={(value) => {
                      setTempMeta((prev) => {
                        const next = venue.align({
                          language: prev.language,
                          template: prev.template,
                          citationStyle: prev.citationStyle || "gbt7714",
                          chartPreset: prev.chartPreset,
                        }, value);
                        return {
                          ...prev,
                          targetJournal: value,
                          language: next.language,
                          template: next.template,
                          citationStyle: next.citationStyle,
                          chartPreset: next.chartPreset,
                        };
                      });
                    }}
                  />
                  <VenueSpecUpdateBanner
                    journal={tempMeta.targetJournal}
                    current={{
                      language: tempMeta.language,
                      template: tempMeta.template,
                      citationStyle: tempMeta.citationStyle || "gbt7714",
                      chartPreset: tempMeta.chartPreset,
                    }}
                    onApply={(suggestion) => {
                      venue.clear();
                      setTempMeta((prev) => ({
                        ...prev,
                        language: suggestion.language,
                        template: suggestion.template,
                        citationStyle: suggestion.citationStyle,
                        chartPreset: suggestion.chartPreset,
                      }));
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-words">目标字数</Label>
                  <Select
                    value={tempMeta.wordCount}
                    onValueChange={(val) => val && setTempMeta({ ...tempMeta, wordCount: val })}
                  >
                    <SelectTrigger id="meta-words">
                      <SelectValue placeholder="选择篇幅" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORD_COUNT_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                      {tempMeta.wordCount && !WORD_COUNT_PRESETS.some((p) => p.value === tempMeta.wordCount) ? (
                        <SelectItem value={tempMeta.wordCount}>{tempMeta.wordCount}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-chart-preset">图表预设</Label>
                <Select
                  value={tempMeta.chartPreset}
                  onValueChange={(val) => {
                    if (val !== "nature" && val !== "agr_journal" && val !== "print_bw") return;
                    venue.mark("chartPreset");
                    setTempMeta({ ...tempMeta, chartPreset: val });
                  }}
                >
                  <SelectTrigger id="meta-chart-preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHART_PRESET_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-entry">写作入口</Label>
                <Select
                  value={tempMeta.agentEntryMode || "unset"}
                  onValueChange={(val) => setTempMeta({
                    ...tempMeta,
                    agentEntryMode: val === "unset" ? "" : val as AgentEntryModeId,
                  })}
                >
                  <SelectTrigger id="meta-entry">
                    <SelectValue placeholder="选择写作入口" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">未选定</SelectItem>
                    {AGENT_ENTRY_MODES.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label} · {m.hint}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">决定文献、大纲、数据和分节写作的顺序。改完后下一步建议会跟着变。</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="meta-authors">作者姓名</Label>
                  <Input
                    id="meta-authors"
                    value={tempMeta.authors}
                    onChange={(e) => setTempMeta({ ...tempMeta, authors: e.target.value })}
                    placeholder="Zhang San, Li Si*"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-affiliations">单位机构信息</Label>
                  <Input
                    id="meta-affiliations"
                    value={tempMeta.affiliations || ""}
                    onChange={(e) => setTempMeta({ ...tempMeta, affiliations: e.target.value })}
                    placeholder="农业科学研究中心，北京 100083"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="meta-keywords">关键词</Label>
                  <Input
                    id="meta-keywords"
                    value={tempMeta.keywords}
                    onChange={(e) => setTempMeta({ ...tempMeta, keywords: e.target.value })}
                    placeholder="农业科技；AI辅助写作；热化学"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-classification">中图分类号</Label>
                  <Input
                    id="meta-classification"
                    value={tempMeta.classification}
                    onChange={(e) => setTempMeta({ ...tempMeta, classification: e.target.value })}
                    placeholder="例如：S-1; TP391"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-research-direction">研究方向 / 主题说明</Label>
                <Textarea
                  id="meta-research-direction"
                  className="min-h-[92px] resize-y"
                  value={tempMeta.researchDirection}
                  onChange={(e) => setTempMeta({ ...tempMeta, researchDirection: e.target.value })}
                  placeholder="例如：生物质与塑料协同热解、催化升级、碳材料制备..."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-abstract">摘要 (Abstract)</Label>
                <Textarea
                  id="meta-abstract"
                  className="min-h-[190px] resize-y"
                  value={tempMeta.abstract}
                  onChange={(e) => setTempMeta({ ...tempMeta, abstract: e.target.value })}
                />
                <BilingualAbstractControls
                  project={project}
                  primaryLanguage={tempMeta.language}
                  abstract={tempMeta.abstract}
                  onAbstractChange={(next) =>
                    setTempMeta((prev) => ({ ...prev, abstract: next }))
                  }
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="meta-outline">论文大纲 / 论证提纲</Label>
                <Textarea
                  id="meta-outline"
                  className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
                  value={tempMeta.outline}
                  onChange={(e) => setTempMeta({ ...tempMeta, outline: e.target.value })}
                  placeholder="可粘贴 Markdown 大纲，侧栏扩写会读取这里的任务结构。"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-references">参考文献列表</Label>
                <Textarea
                  id="meta-references"
                  className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
                  value={tempMeta.referencesText}
                  onChange={(e) => setTempMeta({ ...tempMeta, referencesText: e.target.value })}
                  placeholder="每行一条参考文献；正文引用重排会按 [n] 重新整理这里。"
                />
              </div>
            </section>
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4 shrink-0">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave}>保存更新</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
