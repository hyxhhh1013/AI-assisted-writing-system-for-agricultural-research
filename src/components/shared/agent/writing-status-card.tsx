"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WriteStatus } from "@/lib/agent/write-status";

const STAGE_ORDER: { key: string; label: string }[] = [
  { key: "retrieving", label: "检索" },
  { key: "writing", label: "初稿" },
  { key: "verifying", label: "核查" },
  { key: "refining", label: "修正" },
  { key: "completed", label: "完成" },
];

const STAGE_TITLE: Record<string, string> = {
  retrieving: "检索文献…",
  writing: "生成初稿…",
  verifying: "核查初稿…",
  refining: "修正初稿…",
  completed: "撰写完成",
};

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function WritingStatusCard({
  status,
  onRetry,
}: {
  status: WriteStatus;
  onRetry?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [showReport, setShowReport] = useState(false);
  // 卡片在 writeStatus 为 null 时由父组件卸载，ref 随之重置；
  // 同实例连续写不同章节时按 section 重置 visited，避免上一个章节的阶段残留
  const visitedRef = useRef(new Set<string>());
  const sectionRef = useRef(status.section);
  if (sectionRef.current !== status.section) {
    sectionRef.current = status.section;
    visitedRef.current = new Set<string>();
  }
  if (status.stage) visitedRef.current.add(status.stage);
  const visited = visitedRef.current;

  const running = status.stage !== "completed" && status.stage !== "error";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // 服务端新 elapsedMs 到达时归零本地 tick（避免双计）
  useEffect(() => {
    setTick(0);
  }, [status.elapsedMs]);

  const elapsed = status.elapsedMs + tick * 1000;
  const steps = STAGE_ORDER.filter((s) => visited.has(s.key));
  const currentIdx = status.stage ? steps.findIndex((s) => s.key === status.stage) : -1;
  const isError = status.stage === "error";

  const title = isError
    ? `写「${status.section}」失败`
    : (status.stage && STAGE_TITLE[status.stage]) || `正在撰写「${status.section}」`;

  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3 shadow-sm",
        isError
          ? "border-destructive/30 bg-destructive/5"
          : "border-[#1a5632]/15 bg-white",
      )}
      role="status"
      aria-live="polite"
    >
      {/* 标题行：章节 + 统计 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-[#122820]">{title}</span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-hidden>
          <Clock className="h-3 w-3" />
          {fmtDuration(elapsed)}
        </span>
        {status.chars > 0 ? (
          <span className="text-[11px] text-muted-foreground">已 {status.chars} 字</span>
        ) : status.stage === "writing" ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-[#1a5632]" />
            等待 AI 输出首段（通常数秒）
          </span>
        ) : null}
        {status.stage === "completed" && status.done ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-[#1a5632]">
            <Check className="h-3 w-3" />
            {status.done.passed ? "已通过" : `已按 ${status.done.issueCount} 条意见修正`}
          </span>
        ) : null}
      </div>

      {/* 阶段 stepper：只渲染出现过的阶段（fast 自动裁剪） */}
      {steps.length > 1 ? (
        <div className="mt-2.5 flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              <span
                className={cn(
                  "flex h-5 flex-1 items-center justify-center rounded-full text-[10.5px] font-medium",
                  i <= currentIdx
                    ? "bg-[#1a5632] text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < steps.length - 1 ? <span className="h-px w-2 bg-border/60" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* 详情 + 提示条 */}
      <p className="mt-2 text-[12px] leading-snug text-[#3d4f46]">
        {status.detail ?? "准备中…"}
      </p>
      {status.info.length ? (
        <div className="mt-1.5 space-y-0.5">
          {status.info.map((line) => (
            <p key={line} className="text-[10.5px] text-muted-foreground">
              <span className="mr-1 select-none" aria-hidden="true">·</span>
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {status.warnings.length ? (
        <div className="mt-1.5 space-y-0.5">
          {status.warnings.map((line) => (
            <p key={line} className="flex items-center gap-1 text-[10.5px] text-amber-600">
              <AlertTriangle className="h-3 w-3 shrink-0" /> {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* 完成态摘要行 / 错误态 */}
      {status.stage === "completed" && status.done ? (
        <button
          type="button"
          onClick={() => setShowReport((v) => !v)}
          className="mt-2 w-full rounded-md bg-[#f0f4f1] px-2 py-1.5 text-left text-[11.5px] text-[#1a5632]"
        >
          ✓ 已写回 {status.section} · {status.done.chars} 字
          <span className="ml-1 text-muted-foreground">（点击展开详情）</span>
        </button>
      ) : null}
      {status.stage === "error" && status.error ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-destructive/5 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11.5px] text-destructive">{status.error}</p>
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onRetry}>
              <RotateCcw className="mr-1 h-3 w-3" />
              重试
            </Button>
          ) : null}
        </div>
      ) : null}
      {showReport && status.done?.verification ? (
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/20 p-2 text-[10.5px] text-[#3d4f46]">
          {status.done.verification}
        </pre>
      ) : null}
    </div>
  );
}
