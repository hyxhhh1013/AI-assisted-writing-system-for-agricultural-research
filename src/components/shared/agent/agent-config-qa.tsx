"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PaperConfigRecord } from "@/contracts/paper-passport";
import {
  CONFIG_QA_STEPS,
  defaultConfigQaAnswers,
  formatConfigQaSummary,
  toPaperConfigRecord,
  type ConfigQaStep,
} from "@/lib/agent/config-qa";

interface AgentConfigQaProps {
  projectTitle?: string;
  existing?: Partial<PaperConfigRecord> | null;
  saving?: boolean;
  onComplete: (config: PaperConfigRecord) => Promise<void>;
  onSkip: () => void;
}

/**
 * Phase 0：一问一答收集论文配置（替代整表填写）
 */
export function AgentConfigQa({
  projectTitle,
  existing,
  saving = false,
  onComplete,
  onSkip,
}: AgentConfigQaProps) {
  const [answers, setAnswers] = useState(() =>
    defaultConfigQaAnswers(existing, projectTitle),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [textDraft, setTextDraft] = useState(() => {
    const first = CONFIG_QA_STEPS[0];
    return String(defaultConfigQaAnswers(existing, projectTitle)[first.id] ?? "");
  });
  const [confirming, setConfirming] = useState(false);

  const step: ConfigQaStep | undefined = CONFIG_QA_STEPS[stepIndex];
  const progress = `${Math.min(stepIndex + 1, CONFIG_QA_STEPS.length)}/${CONFIG_QA_STEPS.length}`;

  const answeredChips = useMemo(() => {
    return CONFIG_QA_STEPS.slice(0, confirming ? CONFIG_QA_STEPS.length : stepIndex)
      .map((s) => {
        const v = answers[s.id];
        if (v == null || String(v).trim() === "") return null;
        const label =
          s.choices?.find((c) => c.value === v)?.label
          ?? String(v);
        return { id: s.id, label: `${shortField(s.id)}：${label}` };
      })
      .filter(Boolean) as { id: string; label: string }[];
  }, [answers, stepIndex, confirming]);

  const goNext = (value: string) => {
    if (!step) return;
    const nextAnswers = { ...answers, [step.id]: value };
    setAnswers(nextAnswers);
    if (stepIndex >= CONFIG_QA_STEPS.length - 1) {
      setConfirming(true);
      return;
    }
    const nextStep = CONFIG_QA_STEPS[stepIndex + 1];
    setStepIndex(stepIndex + 1);
    setTextDraft(String(nextAnswers[nextStep.id] ?? ""));
  };

  const goBack = () => {
    if (confirming) {
      setConfirming(false);
      const last = CONFIG_QA_STEPS[CONFIG_QA_STEPS.length - 1];
      setStepIndex(CONFIG_QA_STEPS.length - 1);
      setTextDraft(String(answers[last.id] ?? ""));
      return;
    }
    if (stepIndex <= 0) return;
    const prev = CONFIG_QA_STEPS[stepIndex - 1];
    setStepIndex(stepIndex - 1);
    setTextDraft(String(answers[prev.id] ?? ""));
  };

  const handleSubmitText = () => {
    if (!step) return;
    const trimmed = textDraft.trim();
    if (!trimmed && !step.optional) return;
    goNext(trimmed);
  };

  const finalConfig = toPaperConfigRecord(answers);

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-200/70 bg-white/90 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-amber-950">问答填写论文信息</p>
        <span className="text-[10px] text-muted-foreground">{progress}</span>
      </div>

      {answeredChips.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {answeredChips.map((c) => (
            <span
              key={c.id}
              className="max-w-full truncate rounded-md bg-[#f0f4f1] px-1.5 py-0.5 text-[10px] text-[#3d4f46]"
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}

      {confirming && finalConfig ? (
        <div className="space-y-2">
          <p className="text-xs text-[#122820]">请确认以下信息，保存后继续：</p>
          <p className="rounded-md border border-border/50 bg-[#fafaf8] px-2 py-1.5 text-[11px] leading-relaxed text-[#3d4f46]">
            {formatConfigQaSummary(finalConfig)}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1 text-xs"
              disabled={saving}
              onClick={() => void onComplete(finalConfig)}
            >
              {saving ? "保存中…" : "确认并继续"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={saving}
              onClick={goBack}
            >
              返回修改
            </Button>
          </div>
        </div>
      ) : step ? (
        <div className="space-y-2">
          <p className="text-[13px] font-medium leading-snug text-[#122820]">
            {step.question}
          </p>
          {step.hint ? (
            <p className="text-[10px] text-muted-foreground">{step.hint}</p>
          ) : null}

          {step.kind === "choice" && step.choices ? (
            <div className="flex flex-col gap-1.5">
              {step.choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  disabled={saving}
                  onClick={() => goNext(c.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                    answers[step.id] === c.value
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border/60 bg-white hover:border-primary/30 hover:bg-[#f6f5f1]/60",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                placeholder={step.placeholder}
                className="h-9 text-xs"
                disabled={saving}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmitText();
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  disabled={saving || (!textDraft.trim() && !step.optional)}
                  onClick={handleSubmitText}
                >
                  下一题
                </Button>
                {step.optional ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={saving}
                    onClick={() => goNext("")}
                  >
                    跳过
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-0.5">
            {stepIndex > 0 || confirming ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={saving}
                onClick={goBack}
              >
                上一题
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-7 px-2 text-[11px] text-muted-foreground"
              disabled={saving}
              onClick={onSkip}
            >
              跳过配置，先聊
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function shortField(id: string): string {
  switch (id) {
    case "paperTitle":
      return "题目";
    case "paperType":
      return "类型";
    case "language":
      return "语言";
    case "citationStyle":
      return "引用";
    case "wordCount":
      return "篇幅";
    case "targetJournal":
      return "期刊";
    default:
      return id;
  }
}
