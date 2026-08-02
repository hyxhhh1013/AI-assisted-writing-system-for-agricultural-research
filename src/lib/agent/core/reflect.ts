/**
 * 反思（self-refine）：写完章节后先自查再收尾。
 * 纯函数分析 observations —— 不解析摘要字符串，只读结构化结果。
 *
 * 触发语义：
 * - 只有 write_section（新增内容）才要求自查；refine_content 是修正动作，天然响应某份报告，不再单独要求验证。
 * - 写完后无 validate_citations / verify_content / review_content / run_review_rounds → 推 verify
 * - validate_citations 发现问题且未在之后 refine → 推 refine
 * - 已验证通过 / 已修正 / 无新增写入 → 放行
 */

import type { ToolObservation } from "@/lib/agent/types";

/** 单次写入的反思轮数上限（verify + refine 各一轮） */
export const MAX_REFLECT_ROUNDS = 2;

/** 需要自查的新增写入 */
const WRITE_TOOLS = new Set(["write_section"]);
/** 修正动作（不算新写入，但可解除 refine 待办） */
const REFINE_TOOLS = new Set(["refine_content"]);
/** 自查工具（任一成功即视为已自查）：引用核查、质量核查、四维审查、Phase 7 审查 */
const VERIFY_TOOLS = new Set([
  "validate_citations",
  "verify_content",
  "review_content",
  "run_review_rounds",
]);

export type ReflectionAction = "verify" | "refine" | null;

export interface ReflectionAnalysis {
  action: ReflectionAction;
  nudge: string | null;
  /** refine 阶段的问题数（来自 validate_citations.data） */
  issueCount?: number;
  /** 最后写入的章节 key */
  section?: string;
}

function isWrite(o: ToolObservation, tools: ReadonlySet<string>): boolean {
  return (
    tools.has(o.tool)
    && o.success
    && o.data != null
    && (o.data as { persisted?: unknown }).persisted != null
  );
}

function sectionOf(o: ToolObservation): string | undefined {
  const d = o.data as
    | {
        section?: unknown;
        sectionKey?: unknown;
        persisted?: { sectionKey?: unknown };
      }
    | undefined;
  if (!d) return undefined;
  if (typeof d.section === "string") return d.section;
  if (typeof d.sectionKey === "string") return d.sectionKey;
  if (typeof d.persisted?.sectionKey === "string") return d.persisted.sectionKey;
  return undefined;
}

/** 一次成功 validate_citations 的问题数（硬检未过算至少 1；否则看语义可疑数） */
function validateIssueCount(o: ToolObservation): number {
  const d = o.data as {
    exportReady?: unknown;
    phase5Passed?: unknown;
    grounding?: { suspiciousCount?: unknown };
  };
  const suspicious =
    typeof d?.grounding?.suspiciousCount === "number"
      ? d.grounding.suspiciousCount
      : 0;
  const blocked = d?.exportReady === false || d?.phase5Passed === false;
  return blocked ? Math.max(suspicious, 1) : suspicious;
}

/**
 * 判定当前是否需要对刚写入的内容做反思，以及推什么。
 */
export function analyzeReflection(
  observations: readonly ToolObservation[],
): ReflectionAnalysis {
  // 最后一次新增写入（write_section 成功写回）
  let lastWriteIdx = -1;
  for (let i = observations.length - 1; i >= 0; i--) {
    if (isWrite(observations[i], WRITE_TOOLS)) {
      lastWriteIdx = i;
      break;
    }
  }
  if (lastWriteIdx === -1) return { action: null, nudge: null };

  const section = sectionOf(observations[lastWriteIdx]);

  // 最后一次成功 validate_citations
  let lastValidateIdx = -1;
  for (let i = observations.length - 1; i >= 0; i--) {
    const o = observations[i];
    if (o.tool === "validate_citations" && o.success) {
      lastValidateIdx = i;
      break;
    }
  }

  // validate 覆盖了该写入：据此决定是否推 refine
  if (lastValidateIdx > lastWriteIdx) {
    const issueCount = validateIssueCount(observations[lastValidateIdx]);
    if (issueCount === 0) return { action: null, nudge: null };
    for (let i = observations.length - 1; i > lastValidateIdx; i--) {
      if (isWrite(observations[i], REFINE_TOOLS)) {
        return { action: null, nudge: null };
      }
    }
    return {
      action: "refine",
      issueCount,
      section,
      nudge:
        `【系统】引用核查发现 ${issueCount} 处可疑/硬检问题。`
        + `请 read_section${section ? `(${section})` : ""} 后，`
        + "按 validate 报告用 refine_content(section=..., draftText=全文, feedback=问题清单, persistToProject=true) 修正写回，"
        + "再向用户总结。",
    };
  }

  // validate 早于写入或不存在：写入未被核过；verify_content 自由报告视为已自查
  for (let i = lastWriteIdx + 1; i < observations.length; i++) {
    const o = observations[i];
    if (VERIFY_TOOLS.has(o.tool) && o.success) {
      return { action: null, nudge: null };
    }
  }

  return {
    action: "verify",
    section,
    nudge:
      `【系统】你刚写入了${section ? `「${section}」` : "章节"}，但尚未自查。`
      + "收尾前请先 validate_citations 检查引用，或 verify_content / review_content / run_review_rounds 做质量审查，"
      + "若报告有问题按报告 refine_content 修正写回，再向用户总结。不要只汇报不检查。",
  };
}
