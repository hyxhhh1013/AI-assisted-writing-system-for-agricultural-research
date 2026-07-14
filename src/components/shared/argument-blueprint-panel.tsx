"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Sparkles, GitBranch } from "lucide-react";
import { toast } from "sonner";
import type { ProjectData } from "@/contracts/project";
import {
  parseArgumentBlueprint,
  serializeArgumentBlueprint,
  type ArgumentBlueprint,
  type ArgumentClaim,
  createEmptyArgumentBlueprint,
} from "@/contracts/argument-blueprint";
import { parseWritingBlueprint } from "@/contracts/writing-blueprint";
import {
  generateArgumentBlueprint,
  saveArgumentBlueprint,
} from "@/services/argument-blueprint";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";

interface ArgumentBlueprintPanelProps {
  projectId: string;
  project: ProjectData;
  onSaved?: (updates: Partial<ProjectData>) => void;
}

export function ArgumentBlueprintPanel({
  projectId,
  project,
  onSaved,
}: ArgumentBlueprintPanelProps) {
  const initial = useMemo(
    () => parseArgumentBlueprint(project.argumentBlueprint) ?? createEmptyArgumentBlueprint(),
    [project.argumentBlueprint],
  );
  const [draft, setDraft] = useState<ArgumentBlueprint>(initial);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const writingThesis = parseWritingBlueprint(project.writingBlueprint)?.thesis;

  const handleGenerate = async () => {
    if ((project.outline?.trim().length ?? 0) < 20) {
      toast.error("请先生成或填写大纲（Phase 2）");
      return;
    }
    setGenerating(true);
    try {
      const next = await generateArgumentBlueprint({
        title: project.title || "未命名",
        outline: project.outline || "",
        language: project.language === "en" ? "en" : "zh",
        writingBlueprintThesis: writingThesis,
      });
      setDraft({ ...next, confirmedAt: undefined });
      toast.success("已生成论证蓝图草稿，请核对后确认");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const persist = async (next: ArgumentBlueprint) => {
    setSaving(true);
    try {
      await saveArgumentBlueprint(projectId, next);
      const serialized = serializeArgumentBlueprint(next);
      onSaved?.({ argumentBlueprint: serialized });
      setDraft(next);
      toast.success(next.confirmedAt ? "论证蓝图已确认" : "论证蓝图已保存");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const updateClaim = (index: number, patch: Partial<ArgumentClaim>) => {
    setDraft((prev) => {
      const claims = [...prev.claims];
      claims[index] = { ...claims[index], ...patch };
      return { ...prev, claims, confirmedAt: undefined };
    });
  };

  return (
    <div className="shrink-0 border-b bg-[#f6f5f1]/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#122820]">
          <GitBranch className="h-3.5 w-3.5 text-[#1a5632]" />
          Phase 3 · 论证蓝图
          {draft.confirmedAt ? (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-normal text-[#059669]">
              <CheckCircle2 className="h-3 w-3" /> 已确认
            </span>
          ) : (
            <span className="ml-1 text-[10px] font-normal text-[#9aa8a0]">未确认</span>
          )}
        </h3>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            disabled={generating || saving}
            onClick={() => void handleGenerate()}
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            AI 生成
          </Button>
          <Button
            size="sm"
            className={cn("h-7 text-[11px]", siteTheme.btnPrimary)}
            disabled={saving || !draft.thesis.trim() || draft.claims.length === 0}
            onClick={() =>
              void persist({
                ...draft,
                confirmedAt: Date.now(),
                generatedAt: draft.generatedAt || Date.now(),
              })
            }
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "确认过关"}
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">核心论点 thesis</Label>
        <Textarea
          className="mt-0.5 min-h-[2.5rem] text-xs"
          value={draft.thesis}
          onChange={(e) =>
            setDraft((p) => ({ ...p, thesis: e.target.value, confirmedAt: undefined }))
          }
          placeholder="一句话概括全文要论证的主张"
        />
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">逻辑流</Label>
        <Textarea
          className="mt-0.5 min-h-[2rem] text-xs"
          value={draft.logicalFlow}
          onChange={(e) =>
            setDraft((p) => ({ ...p, logicalFlow: e.target.value, confirmedAt: undefined }))
          }
          placeholder="章节如何层层推进到结论"
        />
      </div>

      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
        {draft.claims.length === 0 ? (
          <p className="text-[11px] text-[#9aa8a0]">尚无 claim。可 AI 生成，或先完成大纲。</p>
        ) : (
          draft.claims.map((c, i) => (
            <div key={c.id || i} className="rounded-md border bg-white/80 px-2 py-1.5">
              <Label className="text-[10px] text-[#6b7c72]">Claim {i + 1}</Label>
              <Textarea
                className="mt-0.5 min-h-[2rem] text-[11px]"
                value={c.claim}
                onChange={(e) => updateClaim(i, { claim: e.target.value })}
              />
              <p className="mt-1 text-[10px] text-[#9aa8a0] line-clamp-2">
                证据：{c.evidence.join("；") || "—"}
                {c.sectionPath ? ` · ${c.sectionPath}` : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
