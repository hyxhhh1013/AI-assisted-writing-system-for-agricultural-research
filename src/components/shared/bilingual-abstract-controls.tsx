"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Languages } from "lucide-react";
import { toast } from "sonner";
import type { ProjectData, ProjectLanguage } from "@/contracts/project";
import { parsePaperPassport } from "@/contracts/paper-passport";
import { generateBilingualAbstract } from "@/services/bilingual-abstract";
import { AiResultDisclaimer } from "@/components/shared/ai-result-disclaimer";

interface BilingualAbstractControlsProps {
  project: ProjectData;
  primaryLanguage: ProjectLanguage;
  abstract: string;
  onAbstractChange: (next: string) => void;
  /** 生成成功后把对照语言回传，便于本会话展示 */
  onCounterpartChange?: (lang: "zh" | "en", text: string) => void;
}

/** W3-ABS-UI：工作台项目设置内生成/查看双语摘要 */
export function BilingualAbstractControls({
  project,
  primaryLanguage,
  abstract,
  onAbstractChange,
  onCounterpartChange,
}: BilingualAbstractControlsProps) {
  const [busy, setBusy] = useState(false);
  const [localCounterpart, setLocalCounterpart] = useState<string | null>(null);

  const passportCounterpart = useMemo(() => {
    const passport = parsePaperPassport(project.paperPassport);
    if (!passport?.abstractSnapshot) return "";
    return primaryLanguage === "en"
      ? passport.abstractSnapshot.zh ?? ""
      : passport.abstractSnapshot.en ?? "";
  }, [project.paperPassport, primaryLanguage]);

  const counterpart =
    localCounterpart ??
    passportCounterpart;

  const counterpartLabel = primaryLanguage === "en" ? "中文摘要（对照）" : "English Abstract（对照）";

  const handleGenerate = async () => {
    const sectionEntries = Object.entries(project.sections || {}).filter(
      ([key, content]) => key !== "abstract" && content.trim().length > 40,
    );

    if (sectionEntries.length === 0) {
      toast.error("请先写完主要章节正文，再生成双语摘要");
      return;
    }

    setBusy(true);
    try {
      const result = await generateBilingualAbstract({
        projectId: project.id,
        title: project.title || "未命名论文",
        primaryLanguage,
        projectMode: project.mode === "research" ? "research" : "review",
        sections: Object.fromEntries(sectionEntries),
        persistToProject: true,
      });
      const primary = primaryLanguage === "en" ? result.en : result.zh;
      const other = primaryLanguage === "en" ? result.zh : result.en;
      onAbstractChange(primary);
      setLocalCounterpart(other);
      onCounterpartChange?.(primaryLanguage === "en" ? "zh" : "en", other);
      toast.success("双语摘要已生成并写回项目");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "双语摘要生成失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-[#1a5632]/15 bg-[#1a5632]/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-[#122820]">双语摘要（Phase 5b）</Label>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 text-xs gap-1.5"
          disabled={busy || !project.id}
          onClick={() => void handleGenerate()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Languages className="h-3.5 w-3.5" />
          )}
          {busy ? "生成中…" : "一键生成中英摘要"}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        主语言写入上方「摘要」字段；对照语言保存在 Passport，可在此查看。生成会覆盖当前摘要。
      </p>
      {(abstract.trim() || counterpart.trim()) && <AiResultDisclaimer compact />}
      {counterpart.trim() ? (
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">{counterpartLabel}</Label>
          <Textarea
            className="min-h-[120px] resize-y text-xs"
            value={counterpart}
            readOnly
          />
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          尚无对照语言摘要。写完正文后点击「一键生成中英摘要」。
        </p>
      )}
    </div>
  );
}
