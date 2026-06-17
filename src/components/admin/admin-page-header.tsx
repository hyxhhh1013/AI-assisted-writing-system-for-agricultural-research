"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminPageHeader({ title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-[#122820]">{title}</h2>
        {subtitle && <p className="text-sm text-[#6b7c72]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface AdminFilterPillsProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export function AdminFilterPills({ value, options, onChange }: AdminFilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <Button
          key={opt.value || "__all"}
          variant={value === opt.value ? "default" : "ghost"}
          size="sm"
          className="h-8 text-[10px]"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
