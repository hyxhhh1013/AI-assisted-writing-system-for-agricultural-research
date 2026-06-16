"use client";

import type { ReactNode } from "react";

interface PlotWorkspaceProps {
  title: string;
  description?: string;
  config: ReactNode;
  preview: ReactNode;
}

/** 科学绘图页统一双栏：左侧配置（固定宽）+ 右侧预览（弹性占满） */
export function PlotWorkspace({ title, description, config, preview }: PlotWorkspaceProps) {
  return (
    <div className="flex h-full min-h-0 w-full bg-[#faf9f6]">
      <section className="flex h-full w-[420px] max-w-[38%] min-w-[300px] shrink-0 flex-col border-r border-[#1a5632]/10 bg-white">
        <div className="shrink-0 border-b border-[#1a5632]/8 px-4 py-3">
          <h2 className="text-sm font-semibold text-[#122820]">{title}</h2>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-[#6b7c72]">{description}</p>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{config}</div>
      </section>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{preview}</section>
    </div>
  );
}
