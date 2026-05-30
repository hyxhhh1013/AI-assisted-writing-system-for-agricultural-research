/** 写作上下文构建 — 从 writing/route.ts 提取的 RAG + prompt 逻辑 */

import fs from "fs";
import path from "path";
import { localRAG, formatRagCitation, cleanSourceName, resolveBibEntry } from "@/lib/rag";
import type { WritingRequest } from "@/contracts/writing";

const METADATA_PATH = path.join(process.cwd(), "data", "metadata.json");

function matchCategory(direction: string): string | null {
  if (!direction || !fs.existsSync(METADATA_PATH)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8")) as { category: string }[];
    const categories = Array.from(new Set(metadata.map((m) => m.category))).filter(c => c && c !== "未分类");
    if (categories.length === 0) return null;
    const kw = direction.toLowerCase();
    const matches = categories
      .map(cat => ({ cat, score: cat.split(/[\s\-_]/).filter(w => kw.includes(w.toLowerCase())).length }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);
    // 分类匹配不用于限定检索范围——写作场景下搜全库更可靠
    // 保留函数供 UI 展示推荐分类用，但不影响检索
    return null;
  } catch {
    return null;
  }
}

export interface WritingContext {
  contextText: string;
  refMapping: Record<string, number>;
  referencesByIndex: string[];
  newSources: string[];
  ragLimit: number;
  ragMaxPerSource: number;
  refRangeHint: string;
}

const sectionKeywords: Record<string, string> = {
  abstract: "综述 研究背景 研究目的 主要结果 结论",
  introduction: "研究背景 综述 研究现状 存在问题 研究进展",
  methods: "实验方法 制备 表征 测试 合成 优化",
  results: "实验数据 结果分析 性能对比 机理 影响因素",
  conclusion: "结论 展望 应用前景 创新点 贡献",
};

const retrievalConfigs: Record<string, { limit: number; maxPerSource: number }> = {
  precise: { limit: 10, maxPerSource: 2 },
  balanced: { limit: 20, maxPerSource: 3 },
  extensive: { limit: 60, maxPerSource: 6 },
};

export async function retrieveWritingContext(
  params: WritingRequest,
  existingReferences: string[],
): Promise<WritingContext> {
  const { title, section, context, researchDirection, retrievalMode = "balanced" } = params;
  const { limit: ragLimit, maxPerSource: ragMaxPerSource } = retrievalConfigs[retrievalMode] || retrievalConfigs.balanced;

  // RAG 检索
  const sectionBoost = sectionKeywords[section] || "";
  const directionBoost = researchDirection || "";
  const enhancedQuery = [sectionBoost, directionBoost, title, context].filter(Boolean).join(" ");
  const matchedCategory = matchCategory(researchDirection || "");

  let contextChunks = await localRAG.search(enhancedQuery, {
    limit: ragLimit,
    maxPerSource: ragMaxPerSource,
    category: matchedCategory || undefined,
  });
  if (contextChunks.length === 0) {
    const fallbackQuery = [sectionBoost, directionBoost, title].filter(Boolean).join(" ");
    contextChunks = await localRAG.search(fallbackQuery, {
      limit: ragLimit,
      maxPerSource: Math.max(1, Math.floor(ragMaxPerSource / 2)),
      category: matchedCategory || undefined,
    });
  }

  // 构建引用映射
  const refMapping: Record<string, number> = {};
  const referencesByIndex: string[] = [];
  const newSources: string[] = [];
  existingReferences.forEach((ref: string, i: number) => {
    refMapping[ref] = i + 1;
    referencesByIndex[i] = ref;
  });

  const contextRefIndices: number[] = [];

  const contextText = contextChunks.length > 0
    ? contextChunks.map((c) => {
        const rawSource = c.metadata.source;
        if (!rawSource || rawSource === "unknown") return c.content;
        // 用原始文件名（含 .pdf）作为 key，确保 resolveBibEntry 能匹配 metadata
        const sourceKey = rawSource;
        const sourceDisplay = cleanSourceName(rawSource);
        let globalIndex: number;
        if (refMapping[sourceKey] != null) {
          globalIndex = refMapping[sourceKey];
        } else if (refMapping[sourceDisplay] != null) {
          // 兼容旧数据：已存的是去除 .pdf 的 cleaned name
          globalIndex = refMapping[sourceDisplay];
        } else {
          globalIndex = Object.keys(refMapping).length + 1;
          refMapping[sourceKey] = globalIndex;
          referencesByIndex[globalIndex - 1] = sourceKey;
          newSources.push(sourceKey);
        }
        if (!contextRefIndices.includes(globalIndex)) contextRefIndices.push(globalIndex);
        const cleanedContent = c.content.replace(/\[(\d+[\d,\s\-–—，、]*)\]/g, "[文献$1]");
        return `[参考来源 [${globalIndex}]: ${formatRagCitation(c)}]\n${cleanedContent}`;
      }).join("\n\n")
    : "（未找到直接相关的文献参考，请根据通用学术知识扩写）";

  const totalRefs = referencesByIndex.length;
  const contextRefs = contextRefIndices.sort((a, b) => a - b);
  const contextRefSet = new Set(contextRefs);

  // 生成完整文献清单：ALL 项目引用（含本次 RAG 新检索的 + 已有文献）
  // 标注 ★本次新增 帮助 AI 识别哪些是有原文上下文的、哪些仅可引用摘要
  const allRefListLines: string[] = [];
  for (let i = 0; i < referencesByIndex.length; i++) {
    const filename = referencesByIndex[i];
    if (!filename) continue;
    const idx = i + 1;
    const entry = resolveBibEntry(filename);
    const bib = entry?.bib;
    const gbTag = entry?.gbTag ? `[${entry.gbTag}]` : "";
    const isNew = contextRefSet.has(idx);
    let line: string;
    if (bib?.firstAuthor || bib?.year || bib?.journal || bib?.doi) {
      const author = bib.firstAuthor
        ? `${bib.firstAuthor}${Array.isArray(bib.authors) && bib.authors.length > 1 ? " 等" : ""}`
        : "";
      const year = bib.year ? ` (${bib.year})` : "";
      const title = bib.title ? ` "${bib.title.slice(0, 60)}${bib.title.length > 60 ? "…" : ""}"` : "";
      const journal = bib.journal ? ` ${bib.journal}` : "";
      line = `  [${idx}]${gbTag} ${author}${year}${title}${journal}`;
    } else {
      line = `  [${idx}] ${cleanSourceName(filename)}`;
    }
    if (isNew) line += " ★本次检索";
    allRefListLines.push(line);
  }

  const refRangeHint = totalRefs > 0
    ? `\n⚠️ 项目共有 ${totalRefs} 篇文献。★本次检索 表示有全文RAG上下文可深度引用；未标星的为已在项目中的文献，可引用但仅有标题/作者信息。引用时一律使用 [n] 编号，编号须与下列列表严格对应。\n完整文献列表：\n${allRefListLines.join("\n")}`
    : "";

  return { contextText, refMapping, referencesByIndex, newSources, ragLimit, ragMaxPerSource, refRangeHint };
}
