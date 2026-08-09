/**
 * write_section 断点续写 / 去重（W3-AP-WRITE-RESUME）
 *
 * 不做 Writer token 级续流（管道无 checkpoint）；策略：
 * 1. 执行中把草稿阶段性写入会话 activeWrite
 * 2. 中断后续跑：同 attemptKey 且草稿够长 → 沿用草稿写回，跳过再烧一遍 AI
 * 3. 已 completed 的同一次尝试 → 直接复用结果
 */

import { createHash } from "crypto";
import type { AgentActiveWrite } from "@/contracts/agent-session";
import type { ParsedToolCall } from "@/lib/agent/types";

/** 完整完成后复用的最低字数 */
export const MIN_REUSE_CHARS = 80;
/** 中断时沿用草稿的最低字数（太短无意义，宁可重跑） */
export const MIN_PARTIAL_CHARS = 400;
/** 会话快照中草稿上限，防 JSON 膨胀 */
export const MAX_ACTIVE_WRITE_DRAFT_CHARS = 80_000;
/** 进度落盘节流 */
export const ACTIVE_WRITE_PATCH_MIN_MS = 1500;

export function buildWriteAttemptKey(params: {
  section: string;
  context: string;
  bullets?: string;
  pipelineMode?: string;
  autoFix?: string | boolean;
  subsectionTitle?: string;
}): string {
  const autoFix =
    params.autoFix === undefined || params.autoFix === null
      ? ""
      : String(params.autoFix);
  const raw = [
    params.section.trim(),
    params.context.trim(),
    (params.bullets ?? "").trim(),
    (params.pipelineMode ?? "fast").trim(),
    autoFix,
    (params.subsectionTitle ?? "").trim(),
  ].join("\0");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function clipActiveWriteDraft(text: string): string {
  if (text.length <= MAX_ACTIVE_WRITE_DRAFT_CHARS) return text;
  return text.slice(0, MAX_ACTIVE_WRITE_DRAFT_CHARS);
}

export type WriteResumeDecision =
  | { action: "run" }
  | {
      action: "reuse";
      draft: string;
      references: string[];
      pipelineMode: "fast" | "full";
      resumedFrom: "completed" | "partial";
      summary: string;
    };

/** 根据会话 activeWrite 判断是否跳过 AI 重跑 */
export function evaluateWriteResume(
  active: AgentActiveWrite | null | undefined,
  params: {
    section: string;
    context: string;
    bullets?: string;
    pipelineMode?: string;
    autoFix?: string | boolean;
    subsectionTitle?: string;
  },
): WriteResumeDecision {
  if (!active || active.tool !== "write_section") return { action: "run" };
  const key = buildWriteAttemptKey(params);
  if (active.attemptKey !== key) return { action: "run" };
  if (active.section !== params.section.trim()) return { action: "run" };

  const draft = (active.draftText ?? "").trim();
  const pipelineMode = active.pipelineMode === "full" ? "full" : "fast";
  const references = Array.isArray(active.references) ? active.references : [];

  if (active.status === "completed" && draft.length >= MIN_REUSE_CHARS) {
    return {
      action: "reuse",
      draft,
      references,
      pipelineMode,
      resumedFrom: "completed",
      summary:
        active.completedSummary
        ?? `断点去重：沿用已完成的 ${active.section}（${draft.length} 字），跳过重复生成`,
    };
  }

  if (
    (active.status === "running" || active.status === "aborted")
    && draft.length >= MIN_PARTIAL_CHARS
  ) {
    return {
      action: "reuse",
      draft,
      references,
      pipelineMode,
      resumedFrom: "partial",
      summary:
        `断点续写：沿用中断前已生成的 ${active.section} 草稿（${draft.length} 字，管道未完整跑完），`
        + "已写回项目；如需核查润色可再叫 refine_content / write_section(full)",
    };
  }

  return { action: "run" };
}

/**
 * 中断后续跑：若 pending 里没有对应 write_section，从 activeWrite.params 补回，
 * 否则 tools 节点不会再执行、草稿无法被 reuse/落库。
 */
export function ensurePendingWriteFromActive(
  pending: ParsedToolCall[] | undefined,
  active: AgentActiveWrite | null | undefined,
): ParsedToolCall[] {
  const list = pending ? [...pending] : [];
  if (!active || active.tool !== "write_section") return list;
  if (active.status === "completed") return list;
  const section = active.section;
  const has = list.some(
    (p) =>
      p.name === "write_section"
      && String(p.args?.section ?? "").trim() === section,
  );
  if (has) return list;
  return [
    {
      id: `resume_write_${active.attemptKey}`,
      name: "write_section",
      args: { ...active.params },
    },
    ...list,
  ];
}

/** 从写作管道事件累计草稿（与 writing-runner collect 同源逻辑） */
export function applyWritingEventToDraftAcc(
  acc: { draft: string; references: string[] },
  event: { type: string; content?: string; text?: string; references?: string[] },
): void {
  if (event.type === "clear_result") {
    acc.draft = "";
    return;
  }
  if (event.type === "delta" && typeof event.content === "string") {
    acc.draft += event.content;
    return;
  }
  if (event.type === "corrected_text" && typeof event.text === "string") {
    acc.draft = event.text;
    return;
  }
  if (event.type === "references" && Array.isArray(event.references)) {
    acc.references = event.references;
  }
}
