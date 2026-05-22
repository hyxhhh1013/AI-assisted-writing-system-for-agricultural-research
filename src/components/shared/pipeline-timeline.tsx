"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, XCircle, Circle, FileSearch, FileText, BookOpen, SearchCheck, BarChart3, Database } from "lucide-react";
import type { PipelineStep } from "@/hooks/use-writing-stream";

const STEP_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  retrieving:   { label: "检索文献",   icon: SearchCheck },
  building_context: { label: "证据整理",   icon: Database },
  writing:      { label: "AI 写作",    icon: FileText },
  verifying:    { label: "审稿核查",   icon: BookOpen },
  refining:     { label: "主编修正",   icon: FileSearch },
  checking_citations: { label: "引用校验", icon: SearchCheck },
  checking_data: { label: "数据核查", icon: BarChart3 },
};

interface PipelineTimelineProps {
  steps: PipelineStep[];
  className?: string;
}

export function PipelineTimeline({ steps, className }: PipelineTimelineProps) {
  if (steps.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {steps.map((step) => {
        const config = STEP_CONFIG[step.key];
        if (!config) return null;
        const Icon = config.icon;

        return (
          <div
            key={step.key}
            className={cn(
              "flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-all duration-300",
              step.status === "running" && "bg-primary/5 border border-primary/10",
              step.status === "error" && "bg-red-50 border border-red-100",
              step.status === "pending" && "opacity-40",
            )}
          >
            {/* 状态图标 */}
            <div className="shrink-0">
              {step.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {step.status === "running" && (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              )}
              {step.status === "error" && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              {step.status === "pending" && (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
            </div>

            {/* 图标 + 标签 */}
            <Icon className={cn(
              "h-3.5 w-3.5 shrink-0",
              step.status === "done" ? "text-green-600" :
              step.status === "running" ? "text-primary" :
              step.status === "error" ? "text-red-500" :
              "text-muted-foreground/60"
            )} />

            <span className={cn(
              "text-xs min-w-0",
              step.status === "running" && "font-semibold text-primary",
              step.status === "done" && "text-foreground",
              step.status === "error" && "text-red-700 font-medium",
            )}>
              {config.label}
            </span>

            {/* 详情 */}
            {step.detail && step.status !== "pending" && (
              <span className={cn(
                "text-[10px] truncate ml-auto",
                step.status === "done" ? "text-green-700" :
                step.status === "error" ? "text-red-600" :
                "text-muted-foreground"
              )}>
                {step.detail}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 默认的管道步骤定义（全部从 pending 开始） */
export const DEFAULT_PIPELINE_STEPS: PipelineStep[] = [
  { key: "retrieving",   label: "检索文献",   status: "pending" },
  { key: "building_context", label: "证据整理",   status: "pending" },
  { key: "writing",      label: "AI 写作",    status: "pending" },
  { key: "verifying",    label: "审稿核查",   status: "pending" },
  { key: "refining",     label: "主编修正",   status: "pending" },
  { key: "checking_citations", label: "引用校验", status: "pending" },
  { key: "checking_data", label: "数据核查", status: "pending" },
];
