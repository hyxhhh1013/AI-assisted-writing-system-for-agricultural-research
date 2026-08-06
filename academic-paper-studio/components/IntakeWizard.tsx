"use client";

import { useMemo } from "react";
import type { StudioController } from "../hooks/use-studio-session";
import {
  FULL_INTAKE_STEPS,
  PLAN_INTAKE_STEPS,
  WORD_COUNT_DEFAULTS,
  validateWordCount,
} from "../flow";
import type {
  ExistingMaterials,
  PaperConfigurationRecord,
  PaperType,
} from "../flow/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";

interface IntakeWizardProps {
  studio: StudioController;
}

export function IntakeWizard({ studio }: IntakeWizardProps) {
  const { session, updateConfig, setIntakeStep, finishIntake, updatePlanAnswers } = studio;
  const isPlan = session.mode === "plan";
  const steps = isPlan ? PLAN_INTAKE_STEPS : FULL_INTAKE_STEPS;
  const index = Math.min(session.intakeStepIndex, steps.length - 1);
  const step = steps[index];
  const progress = ((index + 1) / steps.length) * 100;

  const wordWarning = useMemo(() => {
    if (!session.config.paperType || !session.config.wordCountTarget) return null;
    return validateWordCount(session.config.paperType, session.config.wordCountTarget);
  }, [session.config.paperType, session.config.wordCountTarget]);

  const canNext = (() => {
    if (step.optional) return true;
    if (isPlan) {
      if (step.id === "plan-topic") return Boolean(session.planModeAnswers.topic.trim());
      if (step.id === "plan-materials") return Boolean(session.planModeAnswers.materials.trim());
      if (step.id === "plan-structure") return Boolean(session.planModeAnswers.structurePreference || session.config.paperType);
      return true;
    }
    const cfg = session.config;
    switch (step.field) {
      case "topic":
        return Boolean(cfg.topic?.trim());
      case "discipline":
        return Boolean(cfg.discipline?.trim());
      case "paperType":
        return Boolean(cfg.paperType);
      case "citationFormat":
        return Boolean(cfg.citationFormat);
      case "outputFormat":
        return Boolean(cfg.outputFormat);
      case "bodyLanguage":
        return Boolean(cfg.bodyLanguage);
      case "abstractLanguage":
        return Boolean(cfg.abstractLanguage);
      case "wordCountTarget":
        return Boolean(cfg.wordCountTarget && cfg.wordCountTarget > 0);
      case "domainEvidenceProfile":
        return Boolean(cfg.domainEvidenceProfile);
      case "citationVerification":
        return Boolean(cfg.citationVerification);
      default:
        return true;
    }
  })();

  const goNext = () => {
    if (index >= steps.length - 1) {
      finishIntake();
      return;
    }
    // 选论文类型时自动填建议字数
    if (step.field === "paperType" && session.config.paperType && !isPlan) {
      const pt = session.config.paperType;
      updateConfig({ wordCountTarget: WORD_COUNT_DEFAULTS[pt] });
    }
    setIntakeStep(index + 1);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs text-[#6b7c72]">
          <span>
            配置访谈 · 第 {step.stepNumber} 组 · {index + 1}/{steps.length}
          </span>
          <span>{isPlan ? "计划模式 · 仅 3 问" : "完整配置"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#1a5632]/10">
          <div
            className="h-full rounded-full bg-[#1a5632] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className={cn(siteTheme.card, "p-6 sm:p-8")}>
        <p className="text-xs font-medium uppercase tracking-wide text-[#1a5632]">{step.title}</p>
        <h2 className="mt-2 text-xl font-bold text-[#122820]">{step.question}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7c72]">{step.help}</p>

        <div className="mt-6 space-y-4">
          {isPlan ? (
            <PlanFields
              stepId={step.id}
              session={session}
              updatePlanAnswers={updatePlanAnswers}
              updateConfig={updateConfig}
            />
          ) : (
            <FullFields
              step={step}
              config={session.config}
              updateConfig={updateConfig}
              wordWarning={wordWarning}
            />
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => setIntakeStep(index - 1)}
          >
            上一步
          </Button>
          <div className="flex flex-wrap gap-2">
            {!isPlan ? (
              <Button variant="outline" onClick={() => void studio.skipIntakeToPipeline()}>
                跳过访谈，用默认配置
              </Button>
            ) : null}
            <Button className={siteTheme.btnPrimary} disabled={!canNext} onClick={goNext}>
              {index >= steps.length - 1 ? "生成配置记录" : "下一步"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-[#9aa8a0]">
          赶时间？可跳过访谈；确认页会用项目标题生成最低配置，之后仍可在工作台改。
        </p>
      </div>
    </div>
  );
}

function PlanFields({
  stepId,
  session,
  updatePlanAnswers,
  updateConfig,
}: {
  stepId: string;
  session: StudioController["session"];
  updatePlanAnswers: StudioController["updatePlanAnswers"];
  updateConfig: StudioController["updateConfig"];
}) {
  if (stepId === "plan-topic") {
    return (
      <Textarea
        rows={4}
        value={session.planModeAnswers.topic}
        onChange={(e) => updatePlanAnswers({ topic: e.target.value })}
        placeholder="例如：干旱胁迫下某品种茶叶品质成分的变化"
      />
    );
  }
  if (stepId === "plan-materials") {
    return (
      <Textarea
        rows={4}
        value={session.planModeAnswers.materials}
        onChange={(e) => updatePlanAnswers({ materials: e.target.value })}
        placeholder="例如：已有 10 篇相关 PDF、一批 HPLC 数据、还没有草稿"
      />
    );
  }
  return (
    <OptionList
      options={[
        { value: "imrad", label: "IMRaD（实验论文常见结构）" },
        { value: "literature_review", label: "文献综述结构" },
        { value: "theoretical", label: "其他 / 理论型" },
        { value: "case_study", label: "还不确定" },
      ]}
      value={session.planModeAnswers.structurePreference || session.config.paperType || ""}
      onChange={(v) => {
        updatePlanAnswers({ structurePreference: v });
        updateConfig({ paperType: v as PaperType });
      }}
    />
  );
}

function FullFields({
  step,
  config,
  updateConfig,
  wordWarning,
}: {
  step: (typeof FULL_INTAKE_STEPS)[number];
  config: Partial<PaperConfigurationRecord>;
  updateConfig: (p: Partial<PaperConfigurationRecord>) => void;
  wordWarning: string | null;
}) {
  if (step.kind === "textarea") {
    const key = step.field as "topic" | "researchQuestion";
    return (
      <Textarea
        rows={4}
        value={(config[key] as string) || ""}
        onChange={(e) => updateConfig({ [key]: e.target.value })}
        placeholder="在这里填写…"
      />
    );
  }

  if (step.kind === "text") {
    const key = step.field as "discipline" | "targetJournal";
    return (
      <Input
        value={(config[key] as string) || ""}
        onChange={(e) => updateConfig({ [key]: e.target.value })}
        placeholder={step.field === "targetJournal" ? "例如 Food Chemistry，或填暂无" : "例如：茶叶加工"}
      />
    );
  }

  if (step.kind === "number") {
    return (
      <div className="space-y-2">
        <Input
          type="number"
          min={500}
          step={100}
          value={config.wordCountTarget ?? ""}
          onChange={(e) => updateConfig({ wordCountTarget: Number(e.target.value) || 0 })}
        />
        {wordWarning ? (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{wordWarning}</p>
        ) : null}
      </div>
    );
  }

  if (step.kind === "single" && step.options) {
    const field = step.field;
    const current =
      field === "styleProfileAttached"
        ? String(Boolean(config.styleProfileAttached))
        : String(config[field as keyof PaperConfigurationRecord] ?? "");

    return (
      <OptionList
        options={step.options}
        value={current}
        onChange={(v) => {
          if (field === "styleProfileAttached") {
            updateConfig({ styleProfileAttached: v === "true" });
            return;
          }
          if (field === "wordCountTarget") {
            updateConfig({ wordCountTarget: Number(v) });
            return;
          }
          updateConfig({ [field]: v } as Partial<PaperConfigurationRecord>);
        }}
      />
    );
  }

  if (step.kind === "multi" && step.options && step.field === "existingMaterials") {
    const materials = config.existingMaterials ?? {
      researchQuestion: false,
      literature: false,
      data: false,
      draftSections: false,
      reviewerFeedback: false,
      styleGuide: false,
    };
    return (
      <div className="space-y-2">
        {step.options.map((opt) => {
          const key = opt.value as keyof ExistingMaterials;
          const checked = Boolean(materials[key]);
          return (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3",
                checked ? "border-[#1a5632]/35 bg-[#1a5632]/5" : "border-[#1a5632]/10",
              )}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={() =>
                  updateConfig({
                    existingMaterials: { ...materials, [key]: !checked },
                  })
                }
              />
              <span className="text-sm text-[#122820]">{opt.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (step.field === "coAuthors") {
    const co = config.coAuthors ?? {
      mode: "single" as const,
      count: 1,
      correspondingAuthor: "",
      notes: "",
    };
    return (
      <div className="space-y-4">
        <OptionList
          options={[
            { value: "single", label: "独立作者" },
            { value: "multi", label: "有合作者" },
          ]}
          value={co.mode}
          onChange={(v) =>
            updateConfig({
              coAuthors: { ...co, mode: v as "single" | "multi", count: v === "single" ? 1 : Math.max(2, co.count) },
            })
          }
        />
        {co.mode === "multi" ? (
          <div className="space-y-3 rounded-xl border border-[#1a5632]/10 p-4">
            <div>
              <Label>合作者人数（含自己）</Label>
              <Input
                type="number"
                min={2}
                value={co.count}
                onChange={(e) =>
                  updateConfig({ coAuthors: { ...co, count: Number(e.target.value) || 2 } })
                }
              />
            </div>
            <div>
              <Label>通讯作者</Label>
              <Input
                value={co.correspondingAuthor}
                onChange={(e) =>
                  updateConfig({ coAuthors: { ...co, correspondingAuthor: e.target.value } })
                }
                placeholder="姓名或「导师姓名」"
              />
            </div>
            <div>
              <Label>简要贡献说明</Label>
              <Textarea
                rows={2}
                value={co.notes}
                onChange={(e) => updateConfig({ coAuthors: { ...co, notes: e.target.value } })}
                placeholder="例如：本人实验与初稿；导师选题与修订"
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (step.field === "funding") {
    const fund = config.funding ?? {
      funded: false,
      agency: "",
      grantNumber: "",
      role: "",
      coi: "无利益冲突",
    };
    return (
      <div className="space-y-4">
        <OptionList
          options={[
            { value: "no", label: "无基金资助" },
            { value: "yes", label: "有基金资助" },
          ]}
          value={fund.funded ? "yes" : "no"}
          onChange={(v) => updateConfig({ funding: { ...fund, funded: v === "yes" } })}
        />
        {fund.funded ? (
          <div className="space-y-3 rounded-xl border border-[#1a5632]/10 p-4">
            <div>
              <Label>资助机构</Label>
              <Input
                value={fund.agency}
                onChange={(e) => updateConfig({ funding: { ...fund, agency: e.target.value } })}
              />
            </div>
            <div>
              <Label>项目编号</Label>
              <Input
                value={fund.grantNumber}
                onChange={(e) => updateConfig({ funding: { ...fund, grantNumber: e.target.value } })}
              />
            </div>
            <div>
              <Label>你在项目中的角色</Label>
              <Input
                value={fund.role}
                onChange={(e) => updateConfig({ funding: { ...fund, role: e.target.value } })}
                placeholder="如：参与者 / 课题骨干"
              />
            </div>
          </div>
        ) : null}
        <div>
          <Label>利益冲突声明</Label>
          <Input
            value={fund.coi}
            onChange={(e) => updateConfig({ funding: { ...fund, coi: e.target.value } })}
          />
        </div>
      </div>
    );
  }

  return null;
}

function OptionList({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition",
              active
                ? "border-[#1a5632] bg-[#1a5632]/8 shadow-sm"
                : "border-[#1a5632]/10 hover:border-[#1a5632]/25",
            )}
          >
            <div className="text-sm font-medium text-[#122820]">{opt.label}</div>
            {opt.hint ? <div className="mt-0.5 text-xs text-[#6b7c72]">{opt.hint}</div> : null}
          </button>
        );
      })}
    </div>
  );
}
