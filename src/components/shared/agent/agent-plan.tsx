import { memo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentPlan, AgentSubTask } from "@/contracts/agent";

/** 每个子任务的状态元数据：文案 + 图标 + 文字样式 */
interface StatusMeta {
  label: string;
  textCls: string;
  icon: ReactNode;
}

const SUB_STATUS: Record<AgentSubTask["status"], StatusMeta> = {
  pending: {
    label: "待处理",
    textCls: "text-muted-foreground",
    icon: <Circle className="h-3 w-3 text-muted-foreground/60" />,
  },
  running: {
    label: "执行中",
    textCls: "font-medium text-[#1a5632]",
    icon: <Loader2 className="h-3 w-3 animate-spin text-[#1a5632]" />,
  },
  done: {
    label: "完成",
    textCls: "text-muted-foreground/70",
    icon: <Check className="h-3 w-3 text-[#1a5632]" />,
  },
  skipped: {
    label: "跳过",
    textCls: "text-muted-foreground/50",
    icon: <Minus className="h-3 w-3 text-muted-foreground/50" />,
  },
};

/**
 * Agent 本轮 Plan 的子任务进度卡。
 * 默认展开；每子任务带状态图标/文案，当前执行子任务高亮，顶部进度条示意整体完成度。
 */
export const AgentPlanCard = memo(function AgentPlanCard({
  plan,
  defaultOpen = true,
  /** 顶栏内：限制列表高度，避免把对话区和输入框挤没 */
  compact = false,
}: {
  plan: AgentPlan;
  defaultOpen?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const total = plan.subtasks.length;
  const done = plan.subtasks.filter(
    (s) => s.status === "done" || s.status === "skipped",
  ).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-1.5 rounded-lg border border-border/40 bg-muted/10 px-2.5 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px]"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium text-foreground/85">子任务进度</span>
        <span className="shrink-0 text-muted-foreground">
          {done}/{total}
        </span>
        <span className="ml-2 h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
          <span
            className="block h-full rounded-full bg-[#1a5632] transition-all"
            style={{ width: `${pct}%` }}
          />
        </span>
      </button>
      {open ? (
        <ol
          className={cn(
            "mt-2 space-y-1",
            compact && "max-h-28 overflow-y-auto overscroll-contain pr-0.5",
          )}
        >
          {plan.subtasks.map((s) => {
            const meta = SUB_STATUS[s.status] ?? SUB_STATUS.pending;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-start gap-1.5 text-[11px] leading-snug",
                  meta.textCls,
                )}
              >
                <span className="mt-px shrink-0">{meta.icon}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 break-words",
                    s.status === "done" && "line-through opacity-60",
                  )}
                >
                  {s.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
});
