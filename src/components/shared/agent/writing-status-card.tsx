"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WriteStatus } from "@/lib/agent/write-status";

const STAGE_ORDER = [
  { key: "retrieving", label: "检索" },
  { key: "writing", label: "初稿" },
  { key: "verifying", label: "核查" },
  { key: "refining", label: "修正" },
  { key: "completed", label: "完成" },
] as const;

const STAGE_LIVE: Record<string, string> = {
  retrieving: "检索相关文献",
  writing: "正在生成正文",
  verifying: "核查引用与表述",
  refining: "按意见修正",
};

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtChars(n: number): string {
  return n.toLocaleString("zh-CN");
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
  const visitedRef = useRef(new Set<string>());
  const sectionRef = useRef(status.section);
  if (sectionRef.current !== status.section) {
    sectionRef.current = status.section;
    visitedRef.current = new Set<string>();
  }
  if (status.stage) visitedRef.current.add(status.stage);

  const running = status.stage !== "completed" && status.stage !== "error";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    setTick(0);
  }, [status.elapsedMs]);

  const elapsed = status.elapsedMs + tick * 1000;
  const isError = status.stage === "error";
  const isDone = status.stage === "completed";

  const pipeline = useMemo(() => {
    const visited = visitedRef.current;
    return STAGE_ORDER.filter(
      (s) => s.key !== "completed" && (visited.has(s.key) || status.stage === s.key),
    );
  }, [status.stage, status.chars, status.detail]);

  const currentIdx = status.stage
    ? pipeline.findIndex((s) => s.key === status.stage)
    : -1;

  // —— 完成态：单行摘要，去掉 stepper / 重复字数 / 空洞「完成」——
  if (isDone && status.done) {
    const fixNote = status.done.passed
      ? null
      : `按 ${status.done.issueCount} 条意见修正`;
    return (
      <div
        className="overflow-hidden rounded-lg border border-[#1a5632]/18 bg-gradient-to-r from-[#f4f7f4] to-white"
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={() => status.done?.verification && setShowReport((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
            status.done.verification && "hover:bg-[#1a5632]/[0.03]",
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1a5632] text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[#122820]">
              「{status.section}」已写回
              <span className="ml-1.5 font-normal text-[#3d4f46]">
                {fmtChars(status.done.chars)} 字
              </span>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              <span className="font-normal tabular-nums text-muted-foreground">
                {fmtDuration(elapsed)}
              </span>
            </p>
            {fixNote ? (
              <p className="mt-0.5 text-[11px] text-[#1a5632]/85">{fixNote}</p>
            ) : null}
            {status.info[0] ? (
              <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                {status.info[0]}
              </p>
            ) : null}
          </div>
          {status.done.verification ? (
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                showReport && "rotate-180",
              )}
            />
          ) : null}
        </button>
        {showReport && status.done.verification ? (
          <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap border-t border-[#1a5632]/10 bg-white/80 px-3 py-2 text-[10.5px] leading-relaxed text-[#3d4f46]">
            {status.done.verification}
          </pre>
        ) : null}
      </div>
    );
  }

  // —— 错误态 ——
  if (isError) {
    return (
      <div
        className="rounded-lg border border-destructive/25 bg-destructive/[0.04] px-3 py-2.5"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-destructive">
              「{status.section}」写入失败
            </p>
            <p className="mt-0.5 text-[12px] text-destructive/85">
              {status.error ?? "未知错误"}
            </p>
          </div>
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2 text-[11px]"
              onClick={onRetry}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              重试
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  // —— 进行中：实时条，避免「报告卡」堆叠 ——
  const liveLabel =
    (status.stage && STAGE_LIVE[status.stage])
    || status.detail
    || "准备中…";
  const waitingFirstToken = status.stage === "writing" && status.chars === 0;

  return (
    <div
      className="overflow-hidden rounded-lg border border-[#1a5632]/14 bg-white shadow-[0_1px_0_rgba(18,40,32,0.04)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-3 pt-2.5 pb-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1a5632]/35" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#1a5632]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-tight text-[#122820]">
            撰写「{status.section}」
            <span className="ml-2 font-normal text-[#3d4f46]">{liveLabel}</span>
          </p>
          {waitingFirstToken ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-[#1a5632]" />
              等待首段输出…
            </p>
          ) : status.detail && status.detail !== liveLabel ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {status.detail}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
          <span className="text-[12px] font-medium text-[#122820]">
            {status.chars > 0 ? `${fmtChars(status.chars)} 字` : "—"}
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            {fmtDuration(elapsed)}
          </span>
        </div>
      </div>

      {/* 细进度轨：当前阶段呼吸高亮，已过阶段实心，未到淡灰 */}
      {pipeline.length > 0 ? (
        <div className="flex items-center gap-1 px-3 pb-2.5">
          {pipeline.map((s, i) => {
            const done = currentIdx > i;
            const current = currentIdx === i;
            return (
              <div key={s.key} className="flex min-w-0 flex-1 flex-col gap-1">
                <div
                  className={cn(
                    "h-1 overflow-hidden rounded-full",
                    done || current ? "bg-[#1a5632]/15" : "bg-muted",
                  )}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      done && "w-full bg-[#1a5632]",
                      current && "w-[62%] bg-[#1a5632] animate-pulse",
                      !done && !current && "w-0",
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-center text-[10px]",
                    current
                      ? "font-medium text-[#1a5632]"
                      : done
                        ? "text-[#1a5632]/70"
                        : "text-muted-foreground/70",
                  )}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {status.warnings.length ? (
        <div className="space-y-0.5 border-t border-border/40 px-3 py-1.5">
          {status.warnings.map((line) => (
            <p
              key={line}
              className="flex items-center gap-1 text-[10.5px] text-amber-700"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
