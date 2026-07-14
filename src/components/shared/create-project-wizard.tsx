"use client";

import { useState, useEffect } from "react";
import { BookOpen, FlaskConical, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import {
  getDefaultProjectTitle,
  WRITING_MODES,
  type ProjectWritingMode,
} from "@/contracts/writing-mode";
import type { ProjectLanguage } from "@/contracts/project";
import { ProjectReferenceImportPanel } from "@/components/shared/project/project-reference-import-panel";
import {
  buildConfigFromWizard,
  createProjectWithHandoff,
} from "@/services/project-handoff";
import { syncPaperPassport, getProject } from "@/services/project";
import { MIN_REVIEW_HANDOFF_ENTRIES } from "@/contracts/direction-literature";
import { toast } from "sonner";

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

interface CreateProjectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (projectId: string) => void;
}

type WizardStep = 1 | 2 | 3;

export function CreateProjectWizard({
  open,
  onOpenChange,
  onCreated,
}: CreateProjectWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [refCount, setRefCount] = useState(0);

  const [mode, setMode] = useState<ProjectWritingMode>("review");
  const [language, setLanguage] = useState<ProjectLanguage>("zh");
  const [title, setTitle] = useState("");
  const [targetJournal, setTargetJournal] = useState("");
  const [wordCount, setWordCount] = useState("8000-12000");
  const [citationStyle, setCitationStyle] =
    useState<(typeof CITATION_STYLES)[number]["value"]>("gbt7714");

  const reset = () => {
    setStep(1);
    setProjectId(null);
    setRefCount(0);
    setMode("review");
    setLanguage("zh");
    setTitle("");
    setTargetJournal("");
    setWordCount("8000-12000");
    setCitationStyle("gbt7714");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const paperTitle = title.trim() || getDefaultProjectTitle(mode);

  const handleStep2Next = async () => {
    setBusy(true);
    try {
      const config = buildConfigFromWizard(
        paperTitle,
        mode,
        language,
        targetJournal,
        wordCount,
        citationStyle,
      );

      if (mode === "research") {
        const { projectId: id } = await createProjectWithHandoff({ config, references: [] });
        toast.success("项目已创建");
        handleOpenChange(false);
        onCreated(id);
        return;
      }

      const { projectId: id } = await createProjectWithHandoff({
        config,
        references: [],
        allowEmptyReferences: true,
      });
      setProjectId(id);
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const refreshRefCount = async () => {
    if (!projectId) return;
    const p = await getProject(projectId);
    setRefCount(p?.references?.length ?? 0);
  };

  useEffect(() => {
    if (step === 3 && projectId) {
      void refreshRefCount();
    }
  }, [step, projectId]);

  const handleFinish = async () => {
    if (!projectId) return;
    if (mode === "review" && refCount < MIN_REVIEW_HANDOFF_ENTRIES) {
      toast.error(`综述至少导入 ${MIN_REVIEW_HANDOFF_ENTRIES} 篇参考文献`);
      return;
    }
    setBusy(true);
    try {
      await syncPaperPassport(projectId);
      toast.success("备料完成，进入写作工作台");
      handleOpenChange(false);
      onCreated(projectId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "完成失败");
    } finally {
      setBusy(false);
    }
  };

  const stepLabels = mode === "review" ? ["类型", "P0 配置", "P1 文献"] : ["类型", "P0 配置"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>新建论文项目</DialogTitle>
          <DialogDescription>
            备料与写作分离：在此完成 P0 配置{mode === "review" ? "与 P1 文献导入" : ""}，工作台从 P2 架构开始。
          </DialogDescription>
          <div className="flex gap-1 pt-1">
            {stepLabels.map((label, i) => (
              <span
                key={label}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-medium",
                  step === i + 1 ? "bg-[#1a5632] text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-2">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {(["review", "research"] as const).map((id) => {
                  const meta = WRITING_MODES[id];
                  const Icon = id === "review" ? BookOpen : FlaskConical;
                  const selected = mode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMode(id)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        selected
                          ? "border-[#1a5632]/30 bg-[#1a5632]/5 ring-2 ring-[#1a5632]/30"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", selected ? "text-[#1a5632]" : "text-muted-foreground")} />
                        <span className="text-sm font-semibold">{meta.label}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{meta.description}</p>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">写作语言</Label>
                <div className="flex gap-2">
                  {(["zh", "en"] as const).map((lang) => (
                    <Button
                      key={lang}
                      type="button"
                      size="sm"
                      variant={language === lang ? "default" : "outline"}
                      className="h-8 flex-1 text-xs"
                      onClick={() => setLanguage(lang)}
                    >
                      {lang === "zh" ? "中文" : "English"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-title" className="text-xs">论文题目</Label>
                <Input
                  id="wiz-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={getDefaultProjectTitle(mode)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-[10px] text-muted-foreground">P0 · 论文配置</p>
              <div className="space-y-1.5">
                <Label className="text-xs">目标期刊</Label>
                <Input
                  className="h-8 text-xs"
                  value={targetJournal}
                  onChange={(e) => setTargetJournal(e.target.value)}
                  placeholder="如 Applied Soil Ecology"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">目标字数</Label>
                <Select value={wordCount} onValueChange={(v) => v && setWordCount(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WORD_COUNT_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">引用格式</Label>
                <Select
                  value={citationStyle}
                  onValueChange={(v) => v && setCitationStyle(v as typeof citationStyle)}
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
          )}

          {step === 3 && projectId && (
            <div className="space-y-2 min-h-[280px]">
              <p className="text-[10px] text-[#6366f1] font-medium">
                P1 · 导入参考文献（已 {refCount} 篇，综述至少 {MIN_REVIEW_HANDOFF_ENTRIES} 篇）
              </p>
              <ProjectReferenceImportPanel
                projectId={projectId}
                onImported={() => void refreshRefCount()}
                className="max-h-[min(420px,55vh)]"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 shrink-0">
          {step > 1 && step < 3 && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setStep((step - 1) as WizardStep)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> 上一步
            </Button>
          )}
          {step === 3 && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setStep(2)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> 上一步
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          {step === 1 && (
            <Button size="sm" onClick={() => setStep(2)}>
              下一步 <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {step === 2 && (
            <Button size="sm" disabled={busy} onClick={() => void handleStep2Next()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {mode === "review" ? "下一步：导入文献" : "创建并进入工作台"}
            </Button>
          )}
          {step === 3 && (
            <Button size="sm" disabled={busy} onClick={() => void handleFinish()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              完成备料，进入工作台
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
