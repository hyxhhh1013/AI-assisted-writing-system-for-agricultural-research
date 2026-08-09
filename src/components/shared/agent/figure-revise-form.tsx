"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FIGURE_REVISE_ASPECTS,
  FIGURE_REVISE_ASPECT_LABELS,
  FIGURE_REVISE_PRESETS,
  FIGURE_REVISE_SHORTCUTS,
  FIGURE_REVISE_TEMPLATES,
  emptyFigureReviseForm,
  type FigureReviseFormValue,
  type FigureReviseAspect,
  type FigureReviseTarget,
} from "@/contracts/figure-revise";
import { cn } from "@/lib/utils";

interface FigureReviseFormProps {
  target: FigureReviseTarget;
  disabled?: boolean;
  onSubmit: (form: FigureReviseFormValue) => void;
  onCancel: () => void;
}

export function FigureReviseForm({
  target,
  disabled,
  onSubmit,
  onCancel,
}: FigureReviseFormProps) {
  const [form, setForm] = useState<FigureReviseFormValue>(emptyFigureReviseForm);

  const toggleAspect = (a: FigureReviseAspect) => {
    setForm((prev) => {
      const has = prev.aspects.includes(a);
      return {
        ...prev,
        aspects: has
          ? prev.aspects.filter((x) => x !== a)
          : [...prev.aspects, a],
      };
    });
  };

  const applyShortcut = (id: string) => {
    const sc = FIGURE_REVISE_SHORTCUTS.find((s) => s.id === id);
    if (!sc) return;
    setForm({
      aspects: [...sc.aspects],
      templateId: sc.templateId,
      colorPreset: sc.colorPreset,
      note: sc.note,
    });
  };

  return (
    <div className="space-y-2 rounded-md border border-[#1a5632]/20 bg-[#f6f8f6] p-2.5 text-[11px]">
      <p className="font-medium text-[#122820]">
        改图意见
        {target.title ? ` · ${target.title}` : ""}
      </p>
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground">快捷（一键填表，可再改）</p>
        <div className="flex flex-wrap gap-1.5">
          {FIGURE_REVISE_SHORTCUTS.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              onClick={() => applyShortcut(s.id)}
              className="rounded-md border border-[#1a5632]/25 bg-white px-2 py-0.5 text-[#1a5632] transition-colors hover:bg-[#1a5632]/8"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FIGURE_REVISE_ASPECTS.map((a) => {
          const on = form.aspects.includes(a);
          return (
            <button
              key={a}
              type="button"
              disabled={disabled}
              onClick={() => toggleAspect(a)}
              className={cn(
                "rounded-md border px-2 py-0.5 transition-colors",
                on
                  ? "border-[#1a5632]/40 bg-[#1a5632]/10 text-[#1a5632]"
                  : "border-border/50 bg-white text-muted-foreground hover:border-[#1a5632]/25",
              )}
            >
              {FIGURE_REVISE_ASPECT_LABELS[a]}
            </button>
          );
        })}
      </div>
      {form.aspects.includes("template") ? (
        <label className="flex items-center gap-2 text-muted-foreground">
          <span className="shrink-0">模板</span>
          <select
            className="h-7 flex-1 rounded-md border border-border/50 bg-white px-1.5"
            value={form.templateId}
            disabled={disabled}
            onChange={(e) => setForm((p) => ({ ...p, templateId: e.target.value }))}
          >
            {FIGURE_REVISE_TEMPLATES.map((t) => (
              <option key={t.id || "none"} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {form.aspects.includes("color") || form.colorPreset ? (
        <label className="flex items-center gap-2 text-muted-foreground">
          <span className="shrink-0">配色</span>
          <select
            className="h-7 flex-1 rounded-md border border-border/50 bg-white px-1.5"
            value={form.colorPreset}
            disabled={disabled}
            onChange={(e) => setForm((p) => ({ ...p, colorPreset: e.target.value }))}
          >
            {FIGURE_REVISE_PRESETS.map((t) => (
              <option key={t.id || "none"} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Textarea
        value={form.note}
        disabled={disabled}
        onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
        placeholder="可选：再补一句（如「酸位/金属位分叉后再汇合」）"
        className="min-h-[52px] resize-none bg-white text-[11px]"
      />
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-7 flex-1 text-[11px]"
          disabled={disabled}
          onClick={() => onSubmit(form)}
        >
          提交改图
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          disabled={disabled}
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
    </div>
  );
}
