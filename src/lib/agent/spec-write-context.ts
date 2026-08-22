/**
 * WRITE-QA-009：Writer 主路径吃 SectionSpec；context/bullets 只作适配说明。
 */

import {
  parseSectionSpec,
  type SectionSpecV1,
} from "@/contracts/section-spec";
import { formatEvidenceBindHint } from "@/lib/agent/evidence-binder";

export type WriteSpecSource = "provided" | "compiled" | "empty";

export function parseWriteSectionSpec(raw: unknown): SectionSpecV1 | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return parseSectionSpec(JSON.parse(trimmed));
    } catch {
      return parseSectionSpec(trimmed);
    }
  }
  return parseSectionSpec(raw);
}

/** 主张表 + 字数带 + 配图槽。证据行由 bind 后的 spec 自带。 */
export function formatWriterContextFromSpec(spec: SectionSpecV1): string {
  const cards = spec.claimCards.map((card) => {
    const ev = card.evidence
      .map((e) => (e.kind === "ref" ? `[${e.n}]${e.grounded}` : `[${e.id}]`))
      .join(" ");
    const warrant = card.warrant ? `｜${card.warrant}` : "";
    return `${card.id} ${card.claim.slice(0, 80)}${warrant} → ${ev || "（待绑定）"}`;
  });
  const figs = spec.figureSlots.length
    ? `规划配图：${spec.figureSlots.join("、")}`
    : "";
  const sub = spec.subsectionTitle ? `子节：${spec.subsectionTitle}` : "";
  return [
    "【本节主张】按 C1/C2… 逐条覆盖，不要另起结构。",
    sub,
    ...(cards.length > 0 ? cards : ["（尚无主张卡，按语域扩写，不要虚构 [n]）"]),
    `字数带 ${spec.constraints.minChars}–${spec.constraints.maxChars}`,
    figs,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatSpecAdapterNote(
  context: string,
  source: WriteSpecSource | "bullets" | "blueprint" | "context",
): string {
  const extra = context.trim();
  if (!extra) return "";
  if (source === "context" || source === "empty") return "";
  return `【补充说明】${extra.slice(0, 400)}`;
}

/** Writer 上下文：Spec 主张 → 证据绑定表 → 可选用户补充。 */
export function buildSpecWriterDraft(input: {
  spec: SectionSpecV1 | null;
  context?: string;
  source: WriteSpecSource | "bullets" | "blueprint" | "context";
}): string {
  const specBlock = input.spec ? formatWriterContextFromSpec(input.spec) : "";
  const bindHint = input.spec ? formatEvidenceBindHint(input.spec) : "";
  const adapter = formatSpecAdapterNote(input.context ?? "", input.source);
  return [specBlock, bindHint, adapter].filter(Boolean).join("\n\n");
}
