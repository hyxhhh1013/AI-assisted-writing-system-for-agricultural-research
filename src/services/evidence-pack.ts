/**
 * 证据包构建器 — 将文献引用 + 数据结论合并为统一的 Writer 输入。
 * 纯函数，不调 AI。
 */

import type { EvidenceClaim, EvidencePack } from "@/contracts/data-source";

interface RagChunk {
  content: string;
  metadata: { source?: string; [key: string]: unknown };
}

interface BuildEvidencePackOptions {
  ragChunks?: RagChunk[];
  dataClaims?: EvidenceClaim[];
  existingReferences?: string[];
  mode?: "review" | "research";
  formatRagCitation?: (chunk: RagChunk) => string;
}

/**
 * 构建证据包：合并文献证据和数据证据，生成 AI 可消费的摘要。
 */
export function buildEvidencePack(options: BuildEvidencePackOptions): EvidencePack {
  const { ragChunks = [], dataClaims = [], existingReferences = [], mode = "review", formatRagCitation } = options;

  const claims: EvidenceClaim[] = [];

  // 文献证据（RAG 检索结果 → 带编号的引用）
  let litIdx = 0;
  const refMap = new Map<string, number>();
  existingReferences.forEach((ref, i) => refMap.set(ref, i + 1));

  for (const chunk of ragChunks) {
    const source = chunk.metadata.source || "unknown";
    if (source === "unknown") continue;

    litIdx++;
    if (!refMap.has(source)) {
      refMap.set(source, refMap.size + 1);
    }
    const refNum = refMap.get(source)!;

    // 提取 chunk 中第一句作为简要证据
    const snippet = chunk.content.replace(/\n/g, " ").slice(0, 200).trim();

    claims.push({
      id: `L${litIdx}`,
      sourceId: source,
      sourceType: "literature",
      type: "mean",
      text: `[${refNum}] ${snippet}${chunk.content.length > 200 ? "…" : ""}`,
      values: { refNum, source },
      variables: [],
      tolerance: 0,
    });
  }

  // 数据证据
  for (const dc of dataClaims) {
    claims.push({ ...dc });
  }

  // 生成 AI 摘要
  const litClaims = claims.filter(c => c.sourceType === "literature");
  const numClaims = claims.filter(c => c.sourceType === "data");

  let summary = "";

  if (mode === "review") {
    summary = `【文献证据】共 ${litClaims.length} 条可引用来源。`;
    if (litClaims.length > 0) {
      summary += `\n` + litClaims.slice(0, 10).map(c => `  ${c.text}`).join("\n");
      if (litClaims.length > 10) summary += `\n  ...（还有 ${litClaims.length - 10} 条）`;
    }
    summary += `\n\n写作规则（综述）：`;
    summary += `\n· 仅作事实依据，须转述改写，禁止连续照搬原文 ≥15 字`;
    summary += `\n· 他人数据/结论必须 [n] 标注，不得写成「本研究」结果`;
  } else {
    summary = `【文献证据】${litClaims.length} 条 | 【数据证据】${numClaims.length} 条\n`;
    summary += `\n—— 数据证据（定量结论必须引用编号）——`;
    for (const c of numClaims) {
      summary += `\n  [${c.id}] ${c.text}`;
    }
    summary += `\n\n—— 文献证据 ——`;
    for (const c of litClaims.slice(0, 8)) {
      summary += `\n  ${c.text}`;
    }
    summary += `\n\n写作规则：`;
    summary += `\n· 文献引用使用 [n] 编号`;
    summary += `\n· 数据引用使用 [数据ID] 编号（如 [D1-C3]）`;
    summary += `\n· 每个定量结论必须有数据编号`;
    summary += `\n· 数据声明中的数值可在 tolerance 范围内引用，但不得编造新数值`;
  }

  return { claims, summary };
}
