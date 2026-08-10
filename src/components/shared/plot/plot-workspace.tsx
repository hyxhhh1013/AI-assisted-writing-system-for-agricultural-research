"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PlotWorkspaceProps {
  title: string;
  description?: string;
  config: ReactNode;
  preview: ReactNode;
  /**
   * default：窄配置栏（数据图字段表单）
   * wide：左侧编辑整块加宽（多面板/流程图等重编辑）
   */
  configSize?: "default" | "wide";
}

/** 科学绘图页统一双栏：左侧配置 + 右侧预览 */
export function PlotWorkspace({
  title,
  description,
  config,
  preview,
  configSize = "default",
}: PlotWorkspaceProps) {
  const wide = configSize === "wide";
  return (
    <div className="flex h-full min-h-0 w-full bg-[#faf9f6]">
      <section
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-[#1a5632]/10 bg-white",
          wide
            ? "w-[min(720px,56%)] min-w-[420px] max-w-[760px]"
            : "w-[420px] max-w-[38%] min-w-[300px]",
        )}
      >
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
