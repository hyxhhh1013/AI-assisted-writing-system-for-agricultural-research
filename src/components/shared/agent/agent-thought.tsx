"use client";

import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitExecSummary } from "@/lib/agent/split-exec-summary";
import { cn } from "@/lib/utils";

/** 智能体气泡内 Markdown：适合加宽侧栏的阅读排版 */
export function AgentMarkdown({ content, className }: { content: string; className?: string }) {
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
}

const TOOL_LABELS: Record<string, string> = {
  inspect_project: "查看项目状态",
  read_project_asset: "读取项目资产",
  read_section: "读取章节",
  list_references: "列出参考文献",
  list_plot_sources: "查看可配图数据",
  search_knowledge: "检索知识库",
  search_external: "外部文献检索",
  search_external_literature: "外部文献检索",
  get_full_text: "获取全文",
  generate_outline: "生成大纲",
  generate_writing_blueprint: "生成写作蓝图",
  build_argument_blueprint: "生成论证蓝图",
  write_section: "撰写章节",
  refine_content: "润色修正",
  validate_citations: "检查引用",
  write_bilingual_abstract: "双语摘要",
  run_review_rounds: "论文审查",
  check_plagiarism: "查重",
  import_reference: "导入文献",
  generate_chart: "生成图表",
  generate_xrd_analysis: "XRD 分析",
  update_paper_config: "更新论文配置",
  parse_revision_comments: "解析审稿意见",
  apply_revision_item: "按意见修改章节",
  export_manuscript_markdown: "导出 Markdown 手稿",
  recall_recent_work: "回顾近期工作",
  update_work_memory: "更新工作记忆",
  analyze_direction: "分析方向",
  review_content: "内容审查",
  verify_content: "核查内容",
};

export function toolDisplayName(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

interface AgentThoughtProps {
  text: string;
  /** 中间思考默认折叠，减少占屏 */
  defaultOpen?: boolean;
}

/** 过程思考：默认折叠为一行预览 */
export function AgentThought({ text, defaultOpen = false }: AgentThoughtProps) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const preview = text.replace(/\s+/g, " ").trim();

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
            <AgentMarkdown content={text} />
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {preview.length > 72 ? `${preview.slice(0, 72)}…` : preview}
          </span>
        )}
      </button>
    </div>
  );
}

interface AgentActionProps {
  tool: string;
  params: Record<string, unknown>;
  summary?: string;
  error?: string;
  imageUrl?: string;
}

/** 最终回复气泡：正文正常字号；执行摘要小字浅色，不抢主阅读 */
export function AgentSummaryContent({ text }: { text?: string | null }) {
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
}

export function AgentActionCard({
  tool,
  params,
  summary,
  error,
  imageUrl,
}: AgentActionProps) {
  const [open, setOpen] = useState(Boolean(imageUrl) && !error);
  const label = toolDisplayName(tool);
  const hasDetail = Object.keys(params).length > 0 || Boolean(error) || Boolean(imageUrl);
  const detail = error ?? summary;

  return (
    <div
      className={cn(
        "w-full max-w-full overflow-hidden rounded-lg border text-xs",
        error ? "border-destructive/40 bg-destructive/5" : "border-border/35 bg-muted/15",
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
        <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 whitespace-nowrap font-medium text-foreground/85">
          {label}
        </span>
        {detail ? (
          <>
            <span className="shrink-0 text-border">·</span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                error ? "text-destructive" : "text-muted-foreground",
              )}
              title={detail}
            >
              {detail}
            </span>
          </>
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
          {Object.keys(params).length > 0 ? (
            <pre className="max-h-28 overflow-auto rounded bg-muted/50 p-1.5 text-[10px] text-muted-foreground">
              {JSON.stringify(params, null, 2)}
            </pre>
          ) : null}
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
