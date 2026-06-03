"use client";

import { PipelineTimeline } from "@/components/shared/pipeline-timeline";
import type { PipelineStep } from "@/hooks/use-writing-stream";
import { cn } from "@/lib/utils";

interface WritingSseStatusProps {
  steps: PipelineStep[];
  className?: string;
}

/** 扩写管道 SSE 步骤时间线（PipelineTimeline 封装） */
export function WritingSseStatus({ steps, className }: WritingSseStatusProps) {
  if (steps.length === 0) return null;
  return <PipelineTimeline steps={steps} className={cn("mb-3", className)} />;
}
