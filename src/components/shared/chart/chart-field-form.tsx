"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { ChartRegistryField } from "@/contracts/chart-style";
import { CHART_STYLE_PRESET_LABELS } from "@/contracts/chart-style";

interface ChartFieldFormProps {
  fields: ChartRegistryField[];
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  compact?: boolean;
}

function presetLabel(value: string): string {
  if (value in CHART_STYLE_PRESET_LABELS) {
    return CHART_STYLE_PRESET_LABELS[value as keyof typeof CHART_STYLE_PRESET_LABELS];
  }
  return value;
}

export function ChartFieldForm({ fields, values, onChange, compact }: ChartFieldFormProps) {
  const labelClass = compact ? "text-[10px]" : "text-xs";
  const inputClass = compact ? "h-7 text-xs mt-0.5" : "h-8 text-xs mt-1";

  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
      {fields.map((field) => {
        const val = values[field.key];
        if (field.type === "boolean") {
          const checked = val === true || val === "true";
          return (
            <div key={field.key} className="flex items-center justify-between rounded border px-2 py-1.5 col-span-1">
              <Label className={labelClass}>{field.label}</Label>
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => onChange(field.key, v === true)}
              />
            </div>
          );
        }
        if (field.type === "select" && field.options) {
          return (
            <div key={field.key}>
              <Label className={labelClass}>{field.label}</Label>
              <Select
                value={String(val ?? field.default ?? "")}
                onValueChange={(v) => v && onChange(field.key, v)}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs">
                      {field.key === "preset" ? presetLabel(opt) : opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        if (field.type === "number") {
          return (
            <div key={field.key}>
              <Label className={labelClass}>{field.label}</Label>
              <Input
                type="number"
                className={inputClass}
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={String(val ?? field.default ?? "")}
                onChange={(e) => onChange(field.key, e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          );
        }
        return (
          <div key={field.key}>
            <Label className={labelClass}>{field.label}</Label>
            <Input
              className={inputClass}
              value={String(val ?? field.default ?? "")}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
