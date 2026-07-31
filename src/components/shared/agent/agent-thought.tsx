"use client";

import { ChevronDown, ChevronRight, Loader2, Wrench } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitExecSummary } from "@/lib/agent/split-exec-summary";
import {
  formatToolParamHint,
  humanizeToolNotice,
  isSoftToolNotice,
  toolDisplayName,
} from "@/lib/agent/ui-progress";
import { cn } from "@/lib/utils";

export { toolDisplayName };

/** 智能体气泡内 Markdown：适合加宽侧栏的阅读排版 */
export const AgentMarkdown = memo(function AgentMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-[1.65] text-foreground/90",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
        "prose-h1:mb-2 prose-h1:mt-3 prose-h1:text-base",
        "prose-h2:mb-1.5 prose-h2:mt-3 prose-h2:text-[15px]",
        "prose-h3:mb-1 prose-h3:mt-2.5 prose-h3:text-sm",
        "prose-h4:mb-1 prose-h4:mt-2 prose-h4:text-[13px]",
        "prose-p:my-2 prose-p:leading-[1.65]",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:leading-relaxed",
        "prose-strong:font-semibold prose-strong:text-foreground",
        "prose-code:rounded prose-code:bg-muted/70 prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:my-2 prose-pre:rounded-lg prose-pre:bg-muted/60 prose-pre:text-[11.5px]",
        "prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground",
        "prose-hr:my-3 prose-hr:border-border/60",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
});

interface AgentThoughtProps {
  text: string;
  /** 中间思考默认折叠，减少占屏；变化时跟随（最新展开、变旧收起） */
  defaultOpen?: boolean;
  /** 是否为当前正在运行的「最新思考」：启用打字机效果 + 光标 */
  live?: boolean;
  /** 打字过程中回调（父级可借此做「粘底」滚动） */
  onTypeTick?: () => void;
}

/** 打字机边界：超过此长度的思考直接完整显示，避免等待过久 */
const TYPING_MAX_CHARS = 600;
const TYPING_STEP = 12;
const TYPING_MS = 20;

/** 过程思考：默认折叠为一行预览；最新运行中的思考带打字机效果（纯文本渐进，完成后再渲染 Markdown） */
export const AgentThought = memo(function AgentThought({
  text,
  defaultOpen = false,
  live = false,
  onTypeTick,
}: AgentThoughtProps) {
  const [open, setOpen] = useState(defaultOpen);
  // 双向跟随：成为最新时展开，变旧时自动收起（避免长对话堆满展开的思考气泡）
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  // 初始即按 live 决定，避免首帧先闪完整 markdown 再变空重打
  const [typedLen, setTypedLen] = useState(
    live && text.length <= TYPING_MAX_CHARS ? 0 : text.length,
  );
  const everStartedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTypeTickRef = useRef(onTypeTick);
  useEffect(() => {
    onTypeTickRef.current = onTypeTick;
  }, [onTypeTick]);

  useEffect(() => {
    // 仅「最新且展开且不太长」的思考启用打字机；每个思考只播一次，避免折叠重开重打
    if (live && open && text.length <= TYPING_MAX_CHARS) {
      if (everStartedRef.current) {
        setTypedLen(text.length);
        return;
      }
      everStartedRef.current = true;
      setTypedLen(0);
      timerRef.current = setInterval(() => {
        onTypeTickRef.current?.();
        setTypedLen((prev) => Math.min(prev + TYPING_STEP, text.length));
      }, TYPING_MS);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      };
    }
    setTypedLen(text.length);
    return undefined;
  }, [live, open, text]);

  // 打完后停表（防 interval 空转）
  useEffect(() => {
    if (typedLen >= text.length && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [typedLen, text.length]);

  const preview = text.replace(/\s+/g, " ").trim();
  const typing = typedLen < text.length;

  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-border/40 bg-muted/15 text-[13px]">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/25"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {open ? (
          <div className="min-w-0 flex-1">
            {typing ? (
              <p className="whitespace-pre-wrap break-words leading-[1.65] text-[13.5px] text-foreground/90">
                {text.slice(0, typedLen)}
                <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-pulse rounded-full bg-primary/70" />
              </p>
            ) : (
              <AgentMarkdown content={text} />
            )}
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {preview.length > 72 ? `${preview.slice(0, 72)}…` : preview}
          </span>
        )}
      </button>
    </div>
  );
});

/** 最终回复气泡：正文正常字号；执行摘要小字浅色，不抢主阅读 */
export const AgentSummaryContent = memo(function AgentSummaryContent({
  text,
}: {
  text?: string | null;
}) {
  const { body, execSummary } = splitExecSummary(text);
  if (!body && !execSummary) {
    return (
      <p className="text-[13.5px] leading-relaxed text-foreground/90">
        {typeof text === "string" && text.trim() ? text : "任务已完成。"}
      </p>
    );
  }
  return (
    <div className="space-y-0">
      {body ? <AgentMarkdown content={body} /> : null}
      {execSummary ? (
        <div
          className={
            body
              ? "mt-3 rounded-md border-t border-border/35 bg-muted/25 px-2.5 pb-2 pt-2.5"
              : "rounded-md bg-muted/25 px-2.5 py-2"
          }
        >
          <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground/70">
            执行摘要
          </p>
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-[1.55] text-muted-foreground/75">
            {execSummary}
          </div>
        </div>
      ) : null}
    </div>
  );
});

interface AgentActionProps {
  tool: string;
  params: Record<string, unknown>;
  summary?: string;
  error?: string;
  imageUrl?: string;
  /** 尚无 observation：进行中 */
  pending?: boolean;
}

/** 工具步骤卡：折叠时可点开看详情 */
export const AgentActionCard = memo(function AgentActionCard({
  tool,
  params,
  summary,
  error,
  imageUrl,
  pending = false,
}: AgentActionProps) {
  const soft = isSoftToolNotice(error);
  const [open, setOpen] = useState(Boolean(imageUrl) && !error && !soft);
  const label = toolDisplayName(tool);
  const hint = formatToolParamHint(tool, params);
  const displayDetail = error
    ? soft
      ? humanizeToolNotice(error)
      : error
    : summary;
  const hasRawParams = Object.keys(params).length > 0;
  const hasDetail = hasRawParams || Boolean(error) || Boolean(imageUrl);

  return (
    <div
      className={cn(
        "w-full max-w-full overflow-hidden rounded-lg border text-xs",
        pending
          ? "border-[#1a5632]/20 bg-[#f0f4f1]/80"
          : soft
            ? "border-[#1a5632]/15 bg-[#f6f8f6]"
            : error
              ? "border-destructive/40 bg-destructive/5"
              : "border-border/35 bg-muted/15",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left",
          !hasDetail && "cursor-default",
        )}
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#1a5632]" />
        ) : (
          <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 whitespace-nowrap font-medium text-foreground/85">
          {label}
        </span>
        {hint ? (
          <>
            <span className="shrink-0 text-border">·</span>
            <span className="shrink-0 text-muted-foreground">{hint}</span>
          </>
        ) : null}
        {displayDetail ? (
          <>
            <span className="shrink-0 text-border">·</span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                soft
                  ? "text-[#3d4f46]"
                  : error
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
              title={displayDetail}
            >
              {displayDetail}
            </span>
          </>
        ) : pending ? (
          <span className="min-w-0 flex-1 truncate text-[#3d4f46]/80">进行中</span>
        ) : null}
        {hasDetail ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : null}
      </button>
      {open && hasDetail ? (
        <div className="space-y-1.5 border-t border-border/40 px-2.5 py-1.5 text-[11px]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 本地 /api/charts 动态图
            <img
              src={imageUrl}
              alt={summary || label}
              className="max-h-48 w-auto max-w-full rounded-md border border-border/40 bg-white object-contain"
            />
          ) : null}
          {error && soft ? (
            <p className="text-[#3d4f46]">{humanizeToolNotice(error)}</p>
          ) : null}
          {error && !soft ? <p className="text-destructive">{error}</p> : null}
          {hasRawParams ? (
            <details className="group">
              <summary className="cursor-pointer text-[10px] text-muted-foreground/80 hover:text-muted-foreground">
                技术详情
              </summary>
              <pre className="mt-1 max-h-28 overflow-auto rounded bg-muted/50 p-1.5 text-[10px] text-muted-foreground">
                {JSON.stringify(params, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

/** 对话流底部：实时说明助手在干什么 */
export function AgentWorkingIndicator({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-[#1a5632]/12 bg-gradient-to-r from-[#f0f4f1] to-[#fafaf8] px-3.5 py-2.5 shadow-sm shadow-black/[0.02]"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1a5632]/35" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1a5632]" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-[#122820]">{label}</p>
      <span className="flex shrink-0 items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#1a5632]/70"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
